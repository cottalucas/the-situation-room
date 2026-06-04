#!/usr/bin/env node
/**
 * Phase A verification (offline, no Firestore, no Java, no API).
 *
 * Exercises the REAL code paths that persistence and anaphora depend on:
 *  - crypto.js round-trip (free text encrypts and decrypts back)
 *  - firestore-repo message converters (the exact encrypt-on-write /
 *    decrypt-on-read used for chat persistence) plus the snapshot sort
 *  - person-ref resolver (the deterministic half of anaphora: a resolved
 *    reference maps to an existing person, never a duplicate)
 *  - compactRoomCommandContext recentTurns (the prior turn the model needs to
 *    resolve a pronoun lands in the call context)
 *
 * The full onSnapshot transport + reload rehydration is covered by the Firestore
 * emulator test (tests/emulator/persistence.emulator.test.mjs), which needs Java
 * and cannot run in this environment. See AUDIT_REPORT_2.md.
 */
import { webcrypto } from "node:crypto";
// crypto.js targets the browser global `crypto`. Node 18 exposes Web Crypto on
// globalThis but not as the bare global; assigning it makes the bare binding work.
globalThis.crypto = webcrypto;

import { setUserKey, encryptText, decryptText } from "../src/lib/crypto.js";
import { messageToFirestore, messageFromFirestore, messagesFromSnap } from "../src/lib/firestore-repo.js";
import { resolvePersonRef } from "../src/lib/person-ref.js";
import { compactRoomCommandContext } from "../src/lib/room-command-contract.js";

let passed = 0;
let failed = 0;
const fails = [];

function check(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    fails.push(name);
    console.log(`  FAIL  ${name}`);
  }
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  // Same uid both sides: the user decrypts their own data on reload / any device.
  setUserKey("verify-uid-123");

  console.log("\n[1] crypto round-trip");
  for (const sample of ["Sarah is undermining Chad", "café — déjà vu — 日本語 🚀", "x".repeat(500)]) {
    const enc = await encryptText(sample);
    check(`encrypts (looks like iv:ct) "${sample.slice(0, 18)}"`, typeof enc === "string" && enc.includes(":") && enc !== sample);
    const dec = await decryptText(enc);
    check(`decrypts back "${sample.slice(0, 18)}"`, dec === sample);
  }
  check("empty string passes through", (await encryptText("")) === "");

  console.log("\n[2] message converter round-trip (real persistence code)");
  const original = {
    type: "coach",
    body: "Rouven is your highest-power blocker; align Chad first.",
    text: "",
    label: "Strategist",
    personName: "Rouven",
    command: "ask",
    questions: ["Talk to Chad to lock the framing.", "Then meet Rouven with evidence."],
    cites: ["rouven", "chad"],
    grounded: true,
  };
  const stored = await messageToFirestore(original);
  check("body is encrypted at rest", typeof stored.body === "string" && stored.body.includes(":") && stored.body !== original.body);
  check("questions are encrypted at rest", stored.questions.every((q) => q.includes(":")));
  check("cites stay plaintext (queryable)", eq(stored.cites, ["rouven", "chad"]));
  check("grounded stays plaintext", stored.grounded === true);
  const back = await messageFromFirestore("m1", stored);
  check("body decrypts to original", back.body === original.body);
  check("questions decrypt to original", eq(back.questions, original.questions));
  check("type/label/personName/command preserved", back.type === "coach" && back.label === "Strategist" && back.personName === "Rouven" && back.command === "ask");
  check("cites + grounded preserved", eq(back.cites, ["rouven", "chad"]) && back.grounded === true);

  console.log("\n[3] message thread sort (oldest first, pending last)");
  const fakeDoc = (id, body, ms) => ({ id, data: () => ({ ...body, ts: ms == null ? null : { toMillis: () => ms } }) });
  const enc1 = await messageToFirestore({ type: "user", body: "first" });
  const enc2 = await messageToFirestore({ type: "user", body: "second" });
  const enc3 = await messageToFirestore({ type: "user", body: "pending" });
  const snap = {
    docs: [
      fakeDoc("b", enc2, 2000),
      fakeDoc("c", enc3, null), // pending serverTimestamp
      fakeDoc("a", enc1, 1000),
    ],
  };
  const ordered = await messagesFromSnap(snap);
  check("sorted ascending by ts, pending last", eq(ordered.map((m) => m.body), ["first", "second", "pending"]));

  console.log("\n[4] anaphora resolver (deterministic half)");
  const maya = { id: "maya-1", name: "Maya", role: "PM Web" };
  const sam = { id: "sam-1", name: "Sam", role: "Director" };
  const participants = [maya, sam];
  check('"Maya" resolves to existing Maya (no duplicate)', resolvePersonRef("Maya", [participants])?.id === "maya-1");
  check('lowercase "maya" resolves', resolvePersonRef("maya", [participants])?.id === "maya-1");
  check("stable id resolves", resolvePersonRef("maya-1", [participants])?.id === "maya-1");
  check('unknown name "Diana" does not resolve (would be skipped, not duplicated)', resolvePersonRef("Diana", [participants]) === null);
  check('bare pronoun "she" does not resolve in the write layer (model must resolve via recentTurns)', resolvePersonRef("she", [participants]) === null);

  console.log("\n[5] recentTurns carry the prior turn the model needs for anaphora");
  const messages = [
    { id: "1", type: "user", body: "Maya reports to Sam" },
    { id: "2", type: "updated", body: "Added 1 network relationship." },
    { id: "3", type: "user", body: "and she is against this too" },
  ];
  const ctx = compactRoomCommandContext({
    room: { id: "r1", name: "Apps" },
    decision: { id: "d1", title: "Launch", context: {}, positions: {}, placements: {} },
    participants,
    edges: [{ from: "maya-1", to: "sam-1", type: "defers" }],
    messages,
  });
  const turnTexts = (ctx.recentTurns || []).map((t) => t.text);
  check("recentTurns present", Array.isArray(ctx.recentTurns) && ctx.recentTurns.length >= 2);
  check('prior "Maya reports to Sam" turn is in context', turnTexts.some((t) => t.includes("Maya reports to Sam")));
  check("Maya + Sam are in the room snapshot for resolution", ctx.people.some((p) => p.id === "maya-1") && ctx.people.some((p) => p.id === "sam-1"));

  console.log(`\nPhase A: ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("Failed:", fails.join("; "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

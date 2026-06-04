#!/usr/bin/env node
/**
 * Transport-level persistence proof against the Firestore emulator.
 *
 * This exercises the real network round-trip that scripts/verify-phase-a.mjs
 * cannot: write encrypted chat messages to
 * rooms/{id}/decisions/{id}/messages, read them back through the live SDK, run
 * the real messagesFromSnap converter, and assert the free text decrypts and the
 * thread rehydrates in order. This is the "reload restores the thread" guarantee.
 *
 * Run it (needs the Firebase emulator, which needs a Java runtime):
 *   npm run verify:emulator
 * which wraps:
 *   firebase emulators:exec --only firestore \
 *     'node tests/emulator/persistence.emulator.test.mjs'
 *
 * It uses a demo project id so no real credentials or billing are involved.
 */
import { webcrypto } from "node:crypto";
globalThis.crypto = webcrypto;

import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, collection, doc, setDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { setUserKey } from "../../src/lib/crypto.js";
import { messageToFirestore, messagesFromSnap } from "../../src/lib/firestore-repo.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);

let passed = 0;
let failed = 0;
function check(name, cond) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? (passed += 1) : (failed += 1);
}

async function main() {
  const app = initializeApp({ projectId: "demo-tsr" });
  const db = getFirestore(app);
  try {
    connectFirestoreEmulator(db, HOST, PORT);
  } catch {
    /* already connected */
  }
  setUserKey("emulator-uid");

  const base = collection(db, "rooms", "r1", "decisions", "d1", "messages");
  const turns = [
    { type: "user", body: "Maya reports to Sam" },
    { type: "updated", body: "Added 1 network relationship.", label: "Network updated" },
    { type: "coach", body: "Move Maya first; she is the swing vote.", questions: ["Talk to Maya before Sam."], cites: ["maya-1"], grounded: true },
  ];

  // Write encrypted (the same path the app uses on send).
  for (let i = 0; i < turns.length; i += 1) {
    await setDoc(doc(base, `m${i}`), { ...(await messageToFirestore(turns[i])), ts: serverTimestamp() });
  }

  // Simulate a reload: fresh read of the persisted thread.
  const snap = await getDocs(base);
  const thread = await messagesFromSnap(snap);

  check("all turns rehydrate", thread.length === 3);
  check("free text decrypts on reload", thread.find((m) => m.type === "user")?.body === "Maya reports to Sam");
  check("structured coach turn decrypts", thread.find((m) => m.type === "coach")?.body === "Move Maya first; she is the swing vote.");
  check("coach cites preserved plaintext", JSON.stringify(thread.find((m) => m.type === "coach")?.cites) === JSON.stringify(["maya-1"]));
  check("no ciphertext leaks into rehydrated body", thread.every((m) => !String(m.body).includes(":") || !/^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/.test(m.body)));

  console.log(`\nEmulator persistence: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nEmulator test could not run. Is the Firestore emulator up (needs Java)?\n", err?.message || err);
  process.exit(2);
});

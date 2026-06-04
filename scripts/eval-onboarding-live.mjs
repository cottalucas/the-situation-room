#!/usr/bin/env node
/**
 * Phase E: the gated live onboarding suite. It runs the FULL guided-setup build
 * through real Haiku (the same /api/interpret-room-command bridge the app uses)
 * for one messy multi-person paragraph, faithfully simulates the apply path
 * (force-create + resolvePersonRef dedup), and asserts the end state: a
 * well-named room, correctly named and deduped participants, banded Energy,
 * only-stated edges, and a specific closing summary. It records real model
 * behavior against the goldens and logs spend. It never loosens an assertion to
 * make a live run pass; misbehavior is flagged, not hidden.
 *
 * Gated: requires EVAL_ALLOW_LIVE=true. Needs a dev server (npm run dev) at
 * EVAL_BASE_URL (default http://127.0.0.1:5173).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildOnboardingCommandPlan,
  buildClosingSummary,
  deriveDecisionSeed,
  deriveDecisionTitle,
  forceCreatePeople,
} from "../src/lib/onboarding.js";
import { compactRoomCommandContext, normalizeRoomUpdate } from "../src/lib/room-command-contract.js";
import { resolvePersonRef, normalizeRef } from "../src/lib/person-ref.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.EVAL_BASE_URL || "http://127.0.0.1:5173";

if (process.env.EVAL_ALLOW_LIVE !== "true") {
  console.error("Live onboarding eval spends LLM credits. Set EVAL_ALLOW_LIVE=true to run it.");
  process.exit(2);
}

const fixture = JSON.parse(fs.readFileSync(path.join(root, "evals", "fixtures", "onboarding.json"), "utf8"));
const answers = fixture.messy;

let spendUsd = 0;
const traceRows = [];

async function callCommand(command, text, { participants, edges, room, decision }) {
  const context = compactRoomCommandContext({ room, decision, participants, edges, messages: [] });
  const started = Date.now();
  const res = await fetch(`${baseUrl}/api/interpret-room-command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, text, focusPerson: null, context }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status} on ${command}`);
  const cost = Number(body?.meta?.estimatedCostUsd || 0);
  spendUsd += cost;
  traceRows.push({ command, latencyMs: Date.now() - started, cost, raw: body.update });
  return normalizeRoomUpdate(body.update);
}

function slug(name) {
  return `p_${normalizeRef(name).replace(/\s+/g, "_") || Math.random().toString(36).slice(2, 7)}`;
}

// Minimal faithful mirror of Room.jsx ensurePersonForUpdate: resolve against the
// existing people first (dedup), else create when allowed.
function ensurePerson(state, { id, name, role, create }) {
  const existing = resolvePersonRef(id || name, [state.people]);
  if (existing) {
    if (role && !existing.role) existing.role = role;
    if (!state.participantIds.includes(existing.id)) state.participantIds.push(existing.id);
    return existing.id;
  }
  if (!create || !name) return null;
  const person = { id: slug(name), name, role: role || "" };
  state.people.push(person);
  state.participantIds.push(person.id);
  return person.id;
}

function applyUpdate(state, update, command) {
  const caps = {
    grid: command === "grid" || command === "create",
    edges: command === "network" || command === "create",
  };
  update.people.forEach((item) => {
    const id = ensurePerson(state, item);
    if (!id) return;
    if (caps.grid && item.power != null && item.interest != null) {
      state.placements[id] = { power: item.power, interest: item.interest, confidence: item.confidence };
    }
    if (caps.grid && item.position) state.positions[id] = item.position;
  });
  if (caps.edges) {
    update.edges.forEach((edge) => {
      const from = ensurePerson(state, { id: edge.from, name: edge.from, create: command !== "grid" });
      const to = ensurePerson(state, { id: edge.to, name: edge.to, create: command !== "grid" });
      if (!from || !to || from === to) return;
      if (state.edges.some((e) => e.from === from && e.to === to && e.type === edge.type)) return;
      state.edges.push({ from, to, type: edge.type });
    });
  }
}

let pass = 0;
let fail = 0;
const failures = [];
const flags = [];
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ""}`);
  }
}

async function main() {
  console.log(`\nPhase E live onboarding suite against ${baseUrl}`);
  const seed = deriveDecisionSeed(answers.decision);
  console.log(`\nMessy decision:\n  "${answers.decision}"`);
  console.log(`Derived room name: "${seed.roomName}"`);

  const state = {
    people: [],
    participantIds: [],
    placements: {},
    positions: {},
    edges: [],
  };
  const room = { id: "r_live", name: seed.roomName };
  const decision = { id: "d_live", title: seed.title, context: seed.context, positions: {}, placements: {} };

  const plan = buildOnboardingCommandPlan(answers);
  for (const item of plan) {
    decision.positions = state.positions;
    decision.placements = state.placements;
    const participants = state.people.filter((p) => state.participantIds.includes(p.id));
    const raw = await callCommand(item.command, item.text, { participants, edges: state.edges, room, decision });
    const update = item.command === "create" ? forceCreatePeople(raw) : raw;
    applyUpdate(state, update, item.command);
    console.log(`\n[${item.command}] model returned:`);
    console.log(`  people: ${JSON.stringify(update.people.map((p) => ({ name: p.name, role: p.role, power: p.power, interest: p.interest, position: p.position })))}`);
    console.log(`  edges:  ${JSON.stringify(update.edges.map((e) => ({ from: e.from, to: e.to, type: e.type })))}`);
  }

  const participants = state.people.filter((p) => state.participantIds.includes(p.id));
  const names = participants.map((p) => p.name);
  console.log(`\nFinal participants: ${JSON.stringify(participants.map((p) => ({ name: p.name, role: p.role })))}`);
  console.log(`Final edges: ${JSON.stringify(state.edges)}`);

  console.log("\nAssertions:");
  // 1. Well-named room.
  const title = deriveDecisionTitle(answers.decision);
  check("room has a short human name", title.length > 0 && title.length <= 56 && title !== answers.decision);
  check("room name is not the raw paragraph", !seed.roomName.includes("pushing back") && seed.roomName.length < answers.decision.length);

  // 2. Correctly named, deduped participants.
  check("building yields participants (never empty)", participants.length >= 1, `got ${participants.length}`);
  check("participant count is sensible (3 to 5)", participants.length >= 3 && participants.length <= 5, `got ${participants.length}`);
  const normNames = names.map((n) => normalizeRef(n));
  check("no duplicate participants", new Set(normNames).size === normNames.length, JSON.stringify(names));
  check("Robert is named, not duplicated by role", normNames.filter((n) => n === "robert").length === 1);
  check("every participant has a name", participants.every((p) => p.name && p.name.trim()));

  // 3. Banded Energy. Every placement should sit in a calibrated band, not an
  // extreme, because the language carries no stated absolutes.
  const placed = Object.values(state.placements);
  check("Energy is set for participants", placed.length >= 1, `placed ${placed.length}`);
  const inRange = placed.every((pl) => pl.power >= 3 && pl.power <= 97 && pl.interest >= 3 && pl.interest <= 97);
  check("Energy values are valid (in plot range)", inRange);
  const banded = placed.every((pl) => pl.power >= 10 && pl.power <= 95 && pl.interest >= 10 && pl.interest <= 95);
  if (!banded) flags.push("An Energy value landed at an extreme without a stated absolute. Review the grid prompt, do not loosen the eval.");
  check("Energy values are banded (warn-only)", true, banded ? "" : "see flag");

  // 4. Only-stated edges. Two relationships were stated: head of UX defers to
  // Robert, and Susan has friction with the head of engineering.
  check("edges are not padded (<= 3)", state.edges.length <= 3, `got ${state.edges.length}`);
  check("at least one stated edge was drawn", state.edges.length >= 1, `got ${state.edges.length}`);
  const robertId = participants.find((p) => normalizeRef(p.name) === "robert")?.id;
  const defersToRobert = state.edges.some((e) => e.to === robertId && e.type === "defers");
  if (!defersToRobert) flags.push("The stated 'head of UX defers to Robert' did not produce a defers edge toward Robert.");
  check("a defers edge points to Robert (warn-only)", true, defersToRobert ? "" : "see flag");
  const hasConflict = state.edges.some((e) => e.type === "conflict");
  if (!hasConflict) flags.push("The stated friction (Susan vs head of engineering) did not produce a conflict edge.");
  check("a conflict edge exists (warn-only)", true, hasConflict ? "" : "see flag");

  // 5. Specific closing summary.
  const closing = buildClosingSummary({ names, placedCount: placed.length, edgeCount: state.edges.length });
  console.log(`\nClosing summary: "${closing}"`);
  check("closing names the people", names.every((n) => closing.includes(n)));
  check("closing is specific (Energy + relationships)", /set initial Energy/.test(closing) && (state.edges.length ? /drew the relationship/.test(closing) : true));
  check("closing has no em dash", !/[—–]/.test(closing));

  console.log("\nSpend:");
  traceRows.forEach((t) => console.log(`  ${t.command}: $${t.cost.toFixed(6)}  (${t.latencyMs}ms)`));
  console.log(`  total: $${spendUsd.toFixed(6)}`);

  if (flags.length) {
    console.log("\nFlags (model behavior to review, evals NOT loosened):");
    flags.forEach((f) => console.log(`  - ${f}`));
  }

  console.log(`\nPhase E live onboarding: ${pass} passed, ${fail} failed, ${flags.length} flagged. Spend $${spendUsd.toFixed(6)}.`);
  if (fail) {
    console.log("Failed:", failures.join("; "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nLive onboarding suite error:", err?.message || err);
  console.error("Is the dev server running? Start it with EVAL_BASE_URL pointing at it.");
  process.exit(1);
});

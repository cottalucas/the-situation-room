#!/usr/bin/env node
/**
 * Offline, no-credit evals for @map influence inference (Phase 2c).
 * Each case pairs notes about a participant with the expected influenceLevel and
 * asserts the command contract carries that level through normalization. The
 * golden output stands in for the model's structured response, so behavior is
 * checked without spending credits. Live inference quality is a separate gated run.
 */
import { normalizeRoomUpdate } from "../src/lib/room-command-contract.js";

let passed = 0;
let failed = 0;
const failures = [];
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}`);
  }
}

// Each case: the notes (documentation of intent), the golden @map person object,
// and the expected influenceLevel after normalization.
const CASES = [
  {
    id: "clear-high",
    notes: "CFO has final sign-off on the budget for this initiative; her opposition would kill it.",
    golden: { id: "cfo", influenceLevel: "high" },
    expect: "high",
  },
  {
    id: "clear-low",
    notes: "Junior designer who builds the mockups; no say on scope or budget, informed for execution only.",
    golden: { id: "designer", influenceLevel: "low" },
    expect: "low",
  },
  {
    id: "ambiguous-null",
    notes: "Someone named in passing once; role on this decision is unclear and there is no other signal.",
    golden: { id: "mystery", influenceLevel: null },
    expect: null,
  },
  {
    id: "seniority-not-influence",
    notes: "SVP by title but on sabbatical and explicitly not involved in this call; defers entirely to the team.",
    golden: { id: "svp", influenceLevel: "low" },
    expect: "low",
  },
  {
    id: "junior-gatekeeper-high",
    notes: "Junior infra engineer who owns the deploy pipeline; nothing ships to production without his approval.",
    golden: { id: "infra", influenceLevel: "high" },
    expect: "high",
  },
];

console.log("\n[1] influence inference golden cases");
for (const c of CASES) {
  const update = normalizeRoomUpdate({ summary: "", people: [c.golden], edges: [], openQuestions: [] });
  const got = update.people[0]?.influenceLevel;
  check(`${c.id}: influenceLevel === ${JSON.stringify(c.expect)} (${c.notes.slice(0, 48)}...)`, got === c.expect);
}

console.log("\n[2] contract guards");
// An invalid level normalizes to null, so a bad model token never becomes a level.
check("invalid level -> null", normalizeRoomUpdate({ people: [{ id: "x", influenceLevel: "huge" }] }).people[0].influenceLevel === null);
// A valid level survives alongside other fields.
check("level survives with grid + stance", (() => {
  const u = normalizeRoomUpdate({ people: [{ id: "p", position: "for", power: 70, interest: 60, confidence: "high", influenceLevel: "medium" }] });
  return u.people[0].influenceLevel === "medium" && u.people[0].position === "for" && u.people[0].power != null;
})());

console.log(`\nInfluence inference: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("Failed:", failures.join("; "));
  process.exit(1);
}

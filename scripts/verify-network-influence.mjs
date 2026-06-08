#!/usr/bin/env node
/**
 * Offline, no-credit evals for FIX 1: @network owning influence level.
 * The model's structured output is mocked (golden) and run through the same pure
 * contract the app uses, so the routing decision is checked without spending
 * credits. Live inference quality is a separate gated run.
 *
 * Acceptance gate (all five must pass before deploying):
 *   1. explicit influence statement routes to an influenceLevel update
 *   2. strongly implied influence statement routes the same way
 *   3. ambiguous statement asks rather than writes
 *   4. influenceOverridden:true blocks the write
 *   5. @network never touches powerScore (no grid capability)
 */
import {
  normalizeRoomUpdate,
  commandCapabilities,
  influenceDecision,
} from "../src/lib/room-command-contract.js";

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

// A participant lookup the apply path would build from current decision state.
const lookup = {
  tymon: { isSelf: false, overridden: false },
  priya: { isSelf: false, overridden: false },
  locked: { isSelf: false, overridden: true }, // user set this by hand on the ring
  me: { isSelf: true, overridden: false },
};

console.log("\n[1] @network owns influence: explicit and implied write, ambiguous asks");

// 1. Explicit: "Tymon is no longer a decision maker, drop him to low influence."
{
  const golden = { people: [{ id: "tymon", influenceLevel: "low", confidence: "high" }], edges: [], openQuestions: [] };
  const u = normalizeRoomUpdate(golden);
  const item = u.people[0];
  check("1 explicit -> write low", influenceDecision(item, lookup.tymon, "network") === "write" && item.influenceLevel === "low");
}

// 2. Implied: "Priya needs to be consulted on this" -> medium, confidence medium.
{
  const golden = { people: [{ id: "priya", influenceLevel: "medium", confidence: "medium" }], edges: [], openQuestions: [] };
  const item = normalizeRoomUpdate(golden).people[0];
  check("2 implied -> write medium", influenceDecision(item, lookup.priya, "network") === "write" && item.influenceLevel === "medium");
}

// 3. Ambiguous: model is unsure, returns a low-confidence guess plus a question.
{
  const golden = { people: [{ id: "tymon", influenceLevel: "high", confidence: "low" }], edges: [], openQuestions: ["Does Tymon actually approve this, or just weigh in?"] };
  const u = normalizeRoomUpdate(golden);
  const item = u.people[0];
  check("3 ambiguous -> ask, not write", influenceDecision(item, lookup.tymon, "network") === "ask");
  check("3 ambiguous -> a clarifying question survives", u.openQuestions.length === 1);
}

console.log("\n[2] overridden and grid boundary");

// 4. Overridden: a hand-set level must never be overwritten by @network.
{
  const item = normalizeRoomUpdate({ people: [{ id: "locked", influenceLevel: "high", confidence: "high" }] }).people[0];
  check("4 overridden -> skip (no write)", influenceDecision(item, lookup.locked, "network") === "skip");
}

// 5. @network never touches powerScore: it owns edges + influence, never grid.
{
  const caps = commandCapabilities("network");
  check("5 @network owns influence + edges", caps.influence === true && caps.edges === true);
  check("5 @network never touches grid/power", caps.grid === false);
}

console.log("\n[3] self and guard");
{
  const item = normalizeRoomUpdate({ people: [{ id: "me", influenceLevel: "high", confidence: "high" }] }).people[0];
  check("self is never given an influence level", influenceDecision(item, lookup.me, "network") === "skip");
  // @map keeps writing influence regardless of grid confidence (no behavior change)
  const mapItem = normalizeRoomUpdate({ people: [{ id: "tymon", influenceLevel: "medium", confidence: "low" }] }).people[0];
  check("@map influence not gated by grid confidence", influenceDecision(mapItem, lookup.tymon, "map") === "write");
}

console.log(`\nNetwork influence: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("Failed:", failures.join("; "));
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Phase B offline checks (no API): the Auto-Read threshold and cache-bust logic.
 * The grounding / "uses only room people" / "produces moves" guarantees are
 * covered by the strategist-auto-read fixture in the offline eval suite, which
 * runs through the real normalizeStrategistAnswer.
 */
import { autoReadEligible, autoReadSignature } from "../src/lib/auto-read.js";

let passed = 0;
let failed = 0;
function check(name, cond) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? (passed += 1) : (failed += 1);
}

// Threshold: >= 4 participants AND >= 2 edges.
check("4 people + 2 edges is eligible", autoReadEligible(4, 2) === true);
check("3 people blocks (below participant threshold)", autoReadEligible(3, 5) === false);
check("1 edge blocks (below edge threshold)", autoReadEligible(6, 1) === false);
check("0/0 blocks (empty state)", autoReadEligible(0, 0) === false);

// Cache-bust signature: changes on grid/positions/edges, stable on title/notes.
const base = {
  id: "d1",
  title: "Launch",
  placements: { a: { power: 50, interest: 55 }, b: { power: 70, interest: 60 } },
  positions: { a: "for", b: "against" },
};
const edges = [{ from: "a", to: "b", type: "defers" }];

const sig0 = autoReadSignature(base, edges);
check("signature is stable for identical inputs", autoReadSignature(base, edges) === sig0);
check(
  "title change does NOT bust the cache",
  autoReadSignature({ ...base, title: "Different title" }, edges) === sig0
);
check(
  "placement change DOES bust the cache",
  autoReadSignature({ ...base, placements: { ...base.placements, a: { power: 80, interest: 55 } } }, edges) !== sig0
);
check(
  "position change DOES bust the cache",
  autoReadSignature({ ...base, positions: { ...base.positions, a: "against" } }, edges) !== sig0
);
check(
  "edge change DOES bust the cache",
  autoReadSignature(base, [...edges, { from: "b", to: "a", type: "ally" }]) !== sig0
);
check(
  "confidence change DOES bust the cache",
  autoReadSignature({ ...base, placements: { ...base.placements, a: { power: 50, interest: 55, confidence: "low" } } }, edges) !== sig0
);

console.log(`\nPhase B: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

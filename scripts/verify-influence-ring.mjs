#!/usr/bin/env node
/**
 * Offline evals for the Influence Ring (Phase 6): layout, edge rendering, and the
 * two-gesture drag decision logic, all through the pure influence-ring module.
 * No React, no DOM, no credits.
 */
import {
  CENTER,
  RING_RADIUS,
  ringLayout,
  ringLabelPositions,
  clipLine,
  edgeColor,
  centerDropWrite,
  edgeWrite,
  cancelDrag,
  nearestRing,
  gestureForRadius,
  levelForRing,
  dist,
} from "../src/lib/influence-ring.js";

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
const radiusFromCenter = (n) => dist(n.x, n.y, CENTER, CENTER);
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

const participants = [
  { id: "self", name: "You", isSelf: true },
  { id: "ceo", name: "Priya", isSelf: false },
  { id: "cto", name: "Raj", isSelf: false },
  { id: "vp", name: "Dana", isSelf: false },
  { id: "cs", name: "Lin", isSelf: false },
  { id: "eng", name: "Marco", isSelf: false }, // null influence -> ring 2
];
const influence = {
  ceo: { level: "high", overridden: false },
  cto: { level: "high", overridden: false },
  vp: { level: "medium", overridden: false },
  cs: { level: "low", overridden: false },
  // eng intentionally absent -> null
};
const layout = ringLayout(participants, influence);
const byId = Object.fromEntries(layout.map((n) => [n.id, n]));

console.log("\nSuite A - layout correctness");
// A1 self at center
check("A1 self at center (400,400), ring 0", byId.self.x === CENTER && byId.self.y === CENTER && byId.self.ring === 0);
// A2 high nodes on ring 1
check("A2 high influence nodes on ring 1 (r=140)", ["ceo", "cto"].every((id) => byId[id].ring === 1 && near(radiusFromCenter(byId[id]), RING_RADIUS[1])));
// A3 null lands on ring 2
check("A3 null influence lands on ring 2 (r=260)", byId.eng.ring === 2 && near(radiusFromCenter(byId.eng), RING_RADIUS[2]));
// A4 no overlap: pairwise center distance > sum of radii
let overlap = null;
for (let i = 0; i < layout.length; i += 1) {
  for (let j = i + 1; j < layout.length; j += 1) {
    const a = layout[i];
    const b = layout[j];
    if (dist(a.x, a.y, b.x, b.y) <= a.r + b.r) overlap = `${a.id}/${b.id}`;
  }
}
check("A4 no node overlaps another", overlap === null);
// A5 ring labels at correct radii, centered at the top of each arc (x==center, y<center)
const labels = ringLabelPositions();
check(
  "A5 ring labels at r=140/260/380, top-centered above each arc",
  labels.length === 3 &&
    labels.every((l) => l.x === CENTER && l.y < CENTER - l.radius) &&
    labels[0].radius === 140 && labels[1].radius === 260 && labels[2].radius === 380
);

console.log("\nSuite B - edge rendering");
// B1 ally color, B2 conflict color
check("B1 ally edge color #1D9E75", edgeColor("ally") === "#1D9E75");
check("B2 conflict edge color #E24B4A", edgeColor("conflict") === "#E24B4A");
// B3 arrow stops at node edge, not center
const line = clipLine(byId.ceo, byId.cto);
const endToTargetCenter = dist(line.x2, line.y2, byId.cto.x, byId.cto.y);
const startToSourceCenter = dist(line.x1, line.y1, byId.ceo.x, byId.ceo.y);
check(
  "B3 line stops at node edge (not center)",
  near(endToTargetCenter, byId.cto.r, 0.001) && near(startToSourceCenter, byId.ceo.r, 0.001)
);

console.log("\nSuite C - drag interaction");
// C1 center drag writes correct influenceLevel (drop radius near each ring)
check("C1 center drop near r140 -> high", centerDropWrite("ceo", 150).level === "high");
check("C1 center drop near r260 -> medium", centerDropWrite("ceo", 255).level === "medium");
check("C1 center drop near r380 -> low", centerDropWrite("ceo", 370).level === "low");
// C2 center drag sets overridden true
check("C2 center drop sets overridden true", centerDropWrite("ceo", 150).overridden === true);
// C3 edge drag creates edge with correct type (and rejects invalid)
check("C3 edge write creates correct type", JSON.stringify(edgeWrite("ceo", "cto", "ally")) === JSON.stringify({ from: "ceo", to: "cto", type: "ally" }));
check("C3 edge write rejects self-edge and bad type", edgeWrite("ceo", "ceo", "ally") === null && edgeWrite("ceo", "cto", "bogus") === null);
// C4 escape cancels without writing
check("C4 escape/cancel produces no write", cancelDrag() === null);

console.log("\n(extra) gesture zones and ring snap");
check("gesture: core (<60% r) is move", gestureForRadius(10, 30) === "move");
check("gesture: rim (60-100% r) is edge", gestureForRadius(25, 30) === "edge");
check("gesture: outside node is none", gestureForRadius(40, 30) === null);
check("nearestRing maps radius to ring/level", levelForRing(nearestRing(150)) === "high" && levelForRing(nearestRing(390)) === "low");

console.log(`\nInfluence Ring: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("Failed:", failures.join("; "));
  process.exit(1);
}

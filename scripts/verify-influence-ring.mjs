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
  angleFromCenter,
  CENTER as RC,
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

console.log("\nSuite D - angular position is owned per person");
// D1 a stored angle is used verbatim, not recomputed
const withAngle = { ...influence, ceo: { level: "high", overridden: false, angle: 1.234 } };
const dLayout = ringLayout(participants, withAngle);
const ceoNode = dLayout.find((n) => n.id === "ceo");
check("D1 stored angle is used verbatim", near(ceoNode.angle, 1.234, 0.0001) && ceoNode.needsPersist === false);
// D2 a node without a stored angle is flagged for one-time persistence
check("D2 unstored angle flags needsPersist", dLayout.find((n) => n.id === "cto").needsPersist === true);
// D3 changing ONE person's ring keeps every other node's position byte-for-byte
const allAngles = {
  ceo: { level: "high", overridden: false, angle: 0.2 },
  cto: { level: "high", overridden: false, angle: 1.1 },
  vp: { level: "medium", overridden: false, angle: 2.0 },
  cs: { level: "low", overridden: false, angle: 3.0 },
  eng: { level: "medium", overridden: false, angle: 4.0 },
};
const before = ringLayout(participants, allAngles);
// Move only cs from low to high; everyone else's record is untouched.
const after = ringLayout(participants, { ...allAngles, cs: { ...allAngles.cs, level: "high" } });
const posOf = (arr, id) => { const n = arr.find((x) => x.id === id); return `${n.x.toFixed(4)},${n.y.toFixed(4)}`; };
const othersUnmoved = ["self", "ceo", "cto", "vp", "eng"].every((id) => posOf(before, id) === posOf(after, id));
const csNode = after.find((n) => n.id === "cs");
check("D3 moving one person moves only that person", othersUnmoved);
// D4 the moved person keeps their angle, only the ring radius changes
check("D4 moved person keeps angle, gains new ring", near(csNode.angle, 3.0, 0.0001) && csNode.ring === 1 && near(radiusFromCenter(csNode), RING_RADIUS[1]));
// D5 angleFromCenter inverts the ring placement
const probe = { x: RC + 100 * Math.cos(0.7), y: RC + 100 * Math.sin(0.7) };
check("D5 angleFromCenter inverts placement", near(angleFromCenter(probe.x, probe.y), 0.7, 0.0001));
// D6 THE BUG: with NO stored angles at all, changing one person's level must not
// move anyone else (correctness must not depend on persistence having happened).
const noAngles = {
  ceo: { level: "high", overridden: false },
  cto: { level: "high", overridden: false },
  vp: { level: "medium", overridden: false },
  cs: { level: "low", overridden: false },
};
const b2 = ringLayout(participants, noAngles);
const a2 = ringLayout(participants, { ...noAngles, cs: { level: "high", overridden: false } });
const posOf2 = (arr, id) => { const n = arr.find((x) => x.id === id); return `${n.x.toFixed(4)},${n.y.toFixed(4)}`; };
check("D6 unstored: moving one person's ring moves only that person", ["self", "ceo", "cto", "vp", "eng"].every((id) => posOf2(b2, id) === posOf2(a2, id)));
// D7 that moved (unstored) person keeps its angle, only the radius changes
const csB = b2.find((n) => n.id === "cs"); const csA = a2.find((n) => n.id === "cs");
check("D7 unstored moved person keeps angle, new ring radius", near(csB.angle, csA.angle, 1e-9) && csA.ring === 1 && near(radiusFromCenter(csA), RING_RADIUS[1]));

console.log(`\nInfluence Ring: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("Failed:", failures.join("; "));
  process.exit(1);
}

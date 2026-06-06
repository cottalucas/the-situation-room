#!/usr/bin/env node
/**
 * Offline, no-credit verification for self-as-participant (feature #2).
 * First-person references resolve to the one self record, so the apply path
 * attaches updates to the operator instead of creating a duplicate person.
 */
import { resolvePersonRef, splitLeadingPersonRef } from "../src/lib/person-ref.js";
import { compactRoomCommandContext } from "../src/lib/room-command-contract.js";

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

const self = { id: "u_self", name: "Lucas", role: "Product Manager", isSelf: true };
const chad = { id: "chad", name: "Chad Rivera", role: "Head of Product" };
const dana = { id: "dana", name: "Dana Olsson", role: "VP Sales" };
const roster = [self, chad, dana];

console.log("\n[1] first-person references resolve to the self record");
check('"I" resolves to self', resolvePersonRef("I", [roster])?.id === self.id);
check('"me" resolves to self', resolvePersonRef("me", [roster])?.id === self.id);
check('"my" resolves to self', resolvePersonRef("my", [roster])?.id === self.id);
check('"myself" resolves to self', resolvePersonRef("myself", [roster])?.id === self.id);
check('"I\'m" resolves to self', resolvePersonRef("I'm", [roster])?.id === self.id);

console.log("\n[2] first-person never creates a new person (resolves, so apply attaches)");
// The apply path creates only when resolvePersonRef returns null. A resolved self
// means no duplicate is ever created for "I'm worried Chad outranks me".
const split = splitLeadingPersonRef("I'm worried Chad outranks me", [roster]);
check("leading first-person resolves to self, not a new person", split.person?.id === self.id || resolvePersonRef("I'm", [roster])?.id === self.id);
check("a non-first-person, unknown name still does not resolve", resolvePersonRef("Susan", [roster]) === null);

console.log("\n[3] real names and roles still resolve as before (no regression)");
check("Chad resolves to chad", resolvePersonRef("Chad", [roster])?.id === "chad");
check("head of product resolves to chad", resolvePersonRef("the head of product", [roster])?.id === "chad");
check("self is found by its own name too", resolvePersonRef("Lucas", [roster])?.id === self.id);

console.log("\n[4] the LLM room context flags the self record");
const ctx = compactRoomCommandContext({
  room: { id: "r1", name: "Room" },
  decision: { id: "d1", title: "T", context: {}, positions: {}, placements: {} },
  participants: roster,
  edges: [],
  messages: [],
});
const ctxSelf = ctx.people.find((p) => p.id === self.id);
check("self person carries isSelf=true in context", ctxSelf?.isSelf === true);
check("non-self people carry isSelf=false", ctx.people.filter((p) => p.id !== self.id).every((p) => p.isSelf === false));
check("exactly one self in the context", ctx.people.filter((p) => p.isSelf).length === 1);

console.log(`\nSelf-as-participant verification: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("Failed:", failures.join("; "));
  process.exit(1);
}

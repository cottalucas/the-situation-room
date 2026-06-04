#!/usr/bin/env node
/**
 * Step 2 offline checks (no API): people are reachable by name, first name, role,
 * title, generic leader phrase, and small typos; and a leading multi-word
 * reference splits correctly for @note.
 */
import { resolvePersonRef, splitLeadingPersonRef } from "../src/lib/person-ref.js";

const people = [
  { id: "chad-1", name: "Chad", role: "Head of Product" },
  { id: "rouven-1", name: "Rouven", role: "CPO" },
  { id: "alberto-1", name: "Alberto", role: "CEO" },
  { id: "john-1", name: "John", role: "Head of Sales" },
  { id: "raluca-1", name: "Raluca", role: "PM of Web Team" },
];
const pools = [people];

let passed = 0;
let failed = 0;
function check(name, cond) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? (passed += 1) : (failed += 1);
}
const id = (ref) => resolvePersonRef(ref, pools)?.id || null;

// names + first names + ids
check('"Chad" -> chad', id("Chad") === "chad-1");
check('"chad" -> chad', id("chad") === "chad-1");
check("stable id -> person", id("rouven-1") === "rouven-1");

// roles + titles + abbreviations
check('"head of sales" -> john', id("head of sales") === "john-1");
check('"the CEO" -> alberto', id("the CEO") === "alberto-1");
check('"cpo" -> rouven', id("cpo") === "rouven-1");
check('"chief product officer" -> rouven', id("chief product officer") === "rouven-1");
check('"sales" (role substring) -> john', id("sales") === "john-1");
check('"pm of web" -> raluca', id("pm of web") === "raluca-1");

// generic leader phrases
check('"person in charge" -> alberto (CEO)', id("person in charge") === "alberto-1");
check('"the boss" -> alberto (CEO)', id("the boss") === "alberto-1");

// typo tolerance (conservative, unique only)
check('"Roven" (typo) -> rouven', id("Roven") === "rouven-1");
check('"Chadd" (typo) -> chad', id("Chadd") === "chad-1");

// negatives
check('"the" alone -> null', id("the") === null);
check('unknown "Diana" -> null', id("Diana") === null);

// multi-word @note split (the original bug)
const s1 = splitLeadingPersonRef("head of sales is constantly asking for updates", pools);
check('split "head of sales is constantly..." -> john + body', s1.person?.id === "john-1" && s1.body === "is constantly asking for updates");
const s2 = splitLeadingPersonRef("Chad protects the team but cannot push hard", pools);
check('split "Chad protects..." -> chad + body', s2.person?.id === "chad-1" && s2.body === "protects the team but cannot push hard");
const s3 = splitLeadingPersonRef("the CEO keeps changing his mind", pools);
check('split "the CEO keeps..." -> alberto + body', s3.person?.id === "alberto-1" && s3.body === "keeps changing his mind");
const s4 = splitLeadingPersonRef("nobody here matches this text", pools);
check('split with no known person -> null person', s4.person === null);

console.log(`\nStep 2 resolution: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

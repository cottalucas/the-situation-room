#!/usr/bin/env node
/**
 * Offline, no-credit evals for FIX 3: plain-text intent classification and the
 * routing table. The classifier output is mocked (golden); the pure contract
 * decides the action. No raw text and no API calls.
 *
 * Routing flag default is OFF in production: nothing mutates, a confident intent
 * surfaces a tappable pill, low/unclear shows command suggestions.
 */
import { normalizeClassification, planClassificationAction } from "../src/lib/room-command-contract.js";

let passed = 0;
let failed = 0;
const failures = [];
function check(name, condition) {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; failures.push(name); console.log(`  FAIL  ${name}`); }
}

console.log("\n[1] classifier normalization");
check("valid passes through", (() => {
  const c = normalizeClassification({ intent: "network", confidence: "high", reasoning: "mentions influence" });
  return c.intent === "network" && c.confidence === "high";
})());
check("bad intent -> unclear/low", (() => {
  const c = normalizeClassification({ intent: "banana", confidence: "high" });
  return c.intent === "unclear" && c.confidence === "low";
})());
check("missing object -> unclear/low", normalizeClassification(null).intent === "unclear");

console.log("\n[2] routing with flag OFF (production default): no silent mutation");
check("confident intent -> pill (not route)", (() => {
  const a = planClassificationAction({ intent: "network", confidence: "high" }, false);
  return a.action === "pill" && a.intent === "network";
})());
check("medium confidence -> pill, still no mutation", planClassificationAction({ intent: "energy", confidence: "medium" }, false).action === "pill");
check("low confidence -> suggest", planClassificationAction({ intent: "note", confidence: "low" }, false).action === "suggest");
check("unclear -> suggest", planClassificationAction({ intent: "unclear", confidence: "high" }, false).action === "suggest");
// The flag-off table never routes: no action mutates state on its own.
check("flag OFF never returns route/confirm", ["pill", "suggest"].includes(planClassificationAction({ intent: "network", confidence: "high" }, false).action));

console.log("\n[3] routing with flag ON (after evals pass)");
check("high -> route silently with label", planClassificationAction({ intent: "network", confidence: "high" }, true).action === "route");
check("medium -> confirm", planClassificationAction({ intent: "energy", confidence: "medium" }, true).action === "confirm");
check("low -> suggest", planClassificationAction({ intent: "note", confidence: "low" }, true).action === "suggest");
check("unclear -> suggest", planClassificationAction({ intent: "unclear", confidence: "high" }, true).action === "suggest");

console.log(`\nClassification routing: ${passed} passed, ${failed} failed`);
if (failed) { console.log("Failed:", failures.join("; ")); process.exit(1); }

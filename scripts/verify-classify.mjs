#!/usr/bin/env node
/**
 * Offline, no-credit evals for the controller (the evolved plain-text intent
 * classifier) and its dispatch table. The controller output is mocked (golden);
 * the pure contract decides the action. No raw text and no API calls.
 *
 * Routing flag default is OFF in production: nothing mutates on its own. A
 * confident read surfaces a tappable pill; unclear or low confidence asks the
 * controller's one clarifying question and never guesses.
 */
import { normalizeClassification, planClassificationAction } from "../src/lib/room-command-contract.js";

let passed = 0;
let failed = 0;
const failures = [];
function check(name, condition) {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; failures.push(name); console.log(`  FAIL  ${name}`); }
}

console.log("\n[1] controller normalization");
check("valid map read passes through", (() => {
  const c = normalizeClassification({ intent: "map", command: "network", cleaned_intent: "Record that [person] moves [other].", confidence: "high", clarifying_question: null });
  return c.intent === "map" && c.command === "network" && c.confidence === "high" && c.cleanedIntent.startsWith("Record");
})());
check("advise carries no command", (() => {
  const c = normalizeClassification({ intent: "advise", command: "note", confidence: "high" });
  return c.intent === "advise" && c.command === null;
})());
check("map with off-contract command falls back to broad map", (() => {
  const c = normalizeClassification({ intent: "map", command: "banana", confidence: "high" });
  return c.command === "map";
})());
check("bad intent -> unclear/low", (() => {
  const c = normalizeClassification({ intent: "banana", confidence: "high" });
  return c.intent === "unclear" && c.confidence === "low" && c.command === null;
})());
check("missing object -> unclear/low", normalizeClassification(null).intent === "unclear");
check("camelCase (already normalized) round-trips", (() => {
  const c = normalizeClassification({ intent: "both", command: "note", cleanedIntent: "Tomas is stalling.", confidence: "high", clarifyingQuestion: "" });
  return c.cleanedIntent === "Tomas is stalling." && c.command === "note";
})());

console.log("\n[2] dispatch with flag OFF (production default): no silent mutation");
check("confident map -> pill (not route)", (() => {
  const a = planClassificationAction({ intent: "map", command: "network", confidence: "high" }, false);
  return a.action === "pill" && a.command === "network";
})());
check("medium confidence -> pill, still no mutation", planClassificationAction({ intent: "map", command: "energy", confidence: "medium" }, false).action === "pill");
check("confident advise -> pill", planClassificationAction({ intent: "advise", confidence: "high" }, false).action === "pill");
check("confident both -> one pill for the sequence", (() => {
  const a = planClassificationAction({ intent: "both", command: "note", confidence: "high" }, false);
  return a.action === "pill" && a.intent === "both" && a.command === "note";
})());
check("low confidence -> clarify", planClassificationAction({ intent: "map", command: "note", confidence: "low" }, false).action === "clarify");
check("unclear -> clarify, never guesses", planClassificationAction({ intent: "unclear", confidence: "high" }, false).action === "clarify");
check("flag OFF never returns route/confirm", ["pill", "clarify"].includes(planClassificationAction({ intent: "map", command: "network", confidence: "high" }, false).action));

console.log("\n[3] dispatch with flag ON (after evals pass)");
check("high -> route silently with label", planClassificationAction({ intent: "map", command: "network", confidence: "high" }, true).action === "route");
check("medium -> confirm", planClassificationAction({ intent: "map", command: "energy", confidence: "medium" }, true).action === "confirm");
check("high advise -> route to strategist", (() => {
  const a = planClassificationAction({ intent: "advise", confidence: "high" }, true);
  return a.action === "route" && a.intent === "advise" && a.command === null;
})());
check("low -> clarify", planClassificationAction({ intent: "map", command: "note", confidence: "low" }, true).action === "clarify");
check("unclear -> clarify", planClassificationAction({ intent: "unclear", confidence: "high" }, true).action === "clarify");

console.log("\n[4] golden relay cases (mocked controller reads, contract decides)");
// "log that Chad and I dislike each other" -> map, recorded as a note
check("'log that Chad and I dislike each other' -> map/note", (() => {
  const golden = { intent: "map", command: "note", cleaned_intent: "Record that the operator and Chad dislike each other.", confidence: "high", clarifying_question: null };
  const a = planClassificationAction(golden, false);
  return a.action === "pill" && a.intent === "map" && a.command === "note";
})());
// "who do I move first" -> advise, no mapping surface
check("'who do I move first' -> advise", (() => {
  const golden = { intent: "advise", command: null, cleaned_intent: "The operator asks who to approach first.", confidence: "high", clarifying_question: null };
  const a = planClassificationAction(golden, false);
  return a.action === "pill" && a.intent === "advise" && a.command === null;
})());
// "Tomas is stalling, what do I do" -> both: map the fact, then advise on the updated room
check("'Tomas is stalling, what do I do' -> both (map then advise)", (() => {
  const golden = { intent: "both", command: "note", cleaned_intent: "Tomas is stalling the decision. The operator asks how to respond.", confidence: "high", clarifying_question: null };
  const a = planClassificationAction(golden, false);
  return a.action === "pill" && a.intent === "both" && a.command === "note";
})());
// An ambiguous input -> unclear, exactly one clarifying question, never a guess
check("ambiguous input -> unclear with one question", (() => {
  const golden = { intent: "unclear", command: null, cleaned_intent: "", confidence: "low", clarifying_question: "Do you want to record that, or are you asking what to do about it?" };
  const a = planClassificationAction(golden, false);
  return a.action === "clarify" && a.question === "Do you want to record that, or are you asking what to do about it?";
})());
check("clarify plan carries the controller's question on flag ON too", (() => {
  const golden = { intent: "unclear", command: null, confidence: "low", clarifying_question: "Which decision is this about?" };
  const a = planClassificationAction(golden, true);
  return a.action === "clarify" && a.question === "Which decision is this about?";
})());

console.log(`\nController dispatch: ${passed} passed, ${failed} failed`);
if (failed) { console.log("Failed:", failures.join("; ")); process.exit(1); }

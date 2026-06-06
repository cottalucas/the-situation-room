#!/usr/bin/env node
/**
 * Offline, no-credit verification for the @play command (feature #1).
 * Covers the deterministic readiness gate, the you+1 floor, the absence of any
 * network requirement, the coaching turn, the coaching reply parse, and the
 * generated play shape. No live model is called.
 */
import { checkPlayReadiness, isPlaced, buildPlayCoaching, nextCoachingStep, playSituation, PLAY_BLOCK_REASONS } from "../src/lib/play-readiness.js";
import { normalizeRoomUpdate } from "../src/lib/room-command-contract.js";
import { normalizePlay } from "../src/lib/play-contract.js";

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

const PLACED = { power: 70, interest: 60, confidence: "high" };
const DEFAULT = { power: 50, interest: 55 };

const self = { id: "self", name: "You", isSelf: true };
const chad = { id: "chad", name: "Chad Rivera", role: "Head of Product" };
const dana = { id: "dana", name: "Dana Olsson", role: "VP Sales" };

console.log("\n[1] readiness reason codes, never a play below threshold");
// (a) only self -> missing_people
let r = checkPlayReadiness({ participants: [self], decision: { positions: { self: "for" }, placements: { self: PLACED } } });
check("solo (you only) blocks with missing_people", r.ready === false && r.reason === PLAY_BLOCK_REASONS.PEOPLE);

// (b) you + 1 but the other has no stance -> missing_stance
r = checkPlayReadiness({ participants: [self, chad], decision: { positions: { self: "for", chad: "unknown" }, placements: { self: PLACED, chad: PLACED } } });
check("missing stance blocks with missing_stance", r.ready === false && r.reason === PLAY_BLOCK_REASONS.STANCE && r.missing.includes("chad"));

// (c) you + 1 with stance but the other is unplaced -> missing_grid
r = checkPlayReadiness({ participants: [self, chad], decision: { positions: { self: "for", chad: "against" }, placements: { self: PLACED, chad: DEFAULT } } });
check("missing grid blocks with missing_grid", r.ready === false && r.reason === PLAY_BLOCK_REASONS.GRID && r.missing.includes("chad"));

console.log("\n[2] reason-code priority is people -> stance -> grid");
r = checkPlayReadiness({ participants: [self, chad], decision: { positions: { self: "unknown", chad: "unknown" }, placements: { self: DEFAULT, chad: DEFAULT } } });
check("stance is reported before grid", r.reason === PLAY_BLOCK_REASONS.STANCE);

console.log("\n[3] you + 1 at threshold passes, no network required");
r = checkPlayReadiness({ participants: [self, chad], decision: { positions: { self: "for", chad: "against" }, placements: { self: PLACED, chad: PLACED } } });
check("you + 1 other, all set, zero edges -> ready", r.ready === true && r.reason === null);
check("self counts toward the two-person floor", checkPlayReadiness({ participants: [self, chad], decision: { positions: { self: "for", chad: "for" }, placements: { chad: PLACED } } }).ready === true);

console.log("\n[4] three or more at threshold passes");
r = checkPlayReadiness({
  participants: [self, chad, dana],
  decision: { positions: { self: "for", chad: "against", dana: "neutral" }, placements: { chad: PLACED, dana: PLACED } },
});
check("3-person room, all set -> ready", r.ready === true);

console.log("\n[5] isPlaced: default center is unplaced, explicit/moved is placed");
check("default placement is unplaced", isPlaced(DEFAULT) === false);
check("missing placement is unplaced", isPlaced(undefined) === false);
check("command/drag placement (has confidence) is placed", isPlaced(PLACED) === true);
check("moved-from-default placement is placed", isPlaced({ power: 80, interest: 20 }) === true);
// Self never needs a grid placement for readiness.
check("self does not need a grid placement", checkPlayReadiness({ participants: [self, chad], decision: { positions: { self: "for", chad: "for" }, placements: { self: DEFAULT, chad: PLACED } } }).ready === true);

console.log("\n[6] coaching turn names the gap, asks conversational questions, no framework jargon");
const stanceCoach = buildPlayCoaching({ reason: PLAY_BLOCK_REASONS.STANCE, missing: ["chad"] }, [self, chad]);
check("stance coaching asks about the person by name", /Chad/.test(stanceCoach.questions.join(" ")));
check("stance coaching has 1 to 2 questions", stanceCoach.questions.length >= 1 && stanceCoach.questions.length <= 2);
check("coaching avoids raw framework wording", !/power.?interest|stakeholder|what is .*interest/i.test(stanceCoach.questions.join(" ") + " " + stanceCoach.body));
const peopleCoach = buildPlayCoaching({ reason: PLAY_BLOCK_REASONS.PEOPLE, missing: [] }, [self]);
check("people coaching asks who else is in the room", /who else/i.test(peopleCoach.questions.join(" ")));

console.log("\n[7] coaching reply parses into a structured stance update (same @map path)");
// Fixed golden the parser would receive for the reply "Chad's against it".
const replyUpdate = normalizeRoomUpdate({
  summary: "Set Chad against.",
  people: [{ id: "chad", position: "against" }],
  edges: [],
  openQuestions: [],
});
check("reply extracts the against stance for Chad", replyUpdate.people.some((p) => p.id === "chad" && p.position === "against"));

console.log("\n[8] generated play has all four sections");
const playGolden = {
  headline: "This is a status and surprise problem. Win it before the review, not in the room.",
  steps: [
    { n: 1, person: "chad", framework: "SCARF: status", text: "Give Chad a position that is defensible upward so he carries it." },
    { n: 2, person: "dana", framework: "Fisher & Ury: interest", text: "Trade Dana a face-saving migration story for her accounts." },
  ],
  sequence: ["chad", "dana"],
  risk: { text: "Dana reframes this as revenue risk before you align Chad.", signal: "Chad starts hedging on the call." },
  reasoning: [{ title: "The real dynamic", body: "The substance is on your side; the loss path is a visible fight, so pre-wire alignment." }],
};
const play = normalizePlay(playGolden, [self, chad, dana]);
check("play schema is valid", Boolean(play));
check("situation summary present (headline + reasoning)", Boolean(play?.headline) && play.reasoning.length >= 1);
check("sequenced approach present (>=2 ordered, grounded)", play.sequence.length >= 2 && play.sequence.every((id) => ["self", "chad", "dana"].includes(id)));
check("per-person lever present (framework on each step)", play.steps.every((s) => s.framework && s.person));
check("key risk present (text + signal)", Boolean(play.risk.text && play.risk.signal));

console.log("\n[9] play situation is grounded in the decision");
const situation = playSituation({ title: "Sunset legacy Salesforce", context: { deciding: "Kill the integration", goal: "Cut maintenance load", constraint: "Leadership review" } });
check("situation includes the decision title and goal", /Sunset legacy Salesforce/.test(situation) && /Cut maintenance load/.test(situation));

console.log("\n[10] coaching loop terminates (graceful exit on an honest non-answer)");
const ready = { ready: true, reason: null, missing: [] };
const stanceMiss = { ready: false, reason: PLAY_BLOCK_REASONS.STANCE, missing: ["priya"] };
const gridMiss = { ready: false, reason: PLAY_BLOCK_REASONS.GRID, missing: ["priya"] };
check("closed gap -> ready", nextCoachingStep({ readiness: ready, prev: { reason: "missing_stance", missing: ["priya"], attempts: 0 } }).kind === "ready");
check("reason changed (stance -> grid) is progress, recoach", nextCoachingStep({ readiness: gridMiss, prev: { reason: "missing_stance", missing: ["priya"], attempts: 1 } }).kind === "recoach");
check("missing set shrank is progress, recoach", nextCoachingStep({ readiness: stanceMiss, prev: { reason: "missing_stance", missing: ["priya", "chad"], attempts: 1 } }).kind === "recoach");
check("first non-answer asks once more", nextCoachingStep({ readiness: stanceMiss, prev: { reason: "missing_stance", missing: ["priya"], attempts: 0 } }).kind === "recoach");
check("second non-answer on stance neutralizes (no infinite loop)", (() => { const s = nextCoachingStep({ readiness: stanceMiss, prev: { reason: "missing_stance", missing: ["priya"], attempts: 1 } }); return s.kind === "neutralize" && s.ids.includes("priya"); })());
check("repeated grid non-answer falls back to manual (lens), not a loop", nextCoachingStep({ readiness: gridMiss, prev: { reason: "missing_grid", missing: ["priya"], attempts: 1 } }).kind === "manual");

console.log(`\n@play verification: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("Failed:", failures.join("; "));
  process.exit(1);
}

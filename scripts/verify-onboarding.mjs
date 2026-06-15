#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ONBOARDING_INTRO,
  ONBOARDING_INTRO_RETURNING,
  ONBOARDING_QUESTIONS,
  buildClosingSummary,
  buildOnboardingCommandPlan,
  deriveDecisionSeed,
  deriveDecisionTitle,
  forceCreatePeople,
  hasUsableRoom,
  shouldAutoStartOnboarding,
} from "../src/lib/onboarding.js";
import { normalizeRoomUpdate } from "../src/lib/room-command-contract.js";
import { resolvePersonRef } from "../src/lib/person-ref.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "evals", "fixtures", "onboarding.json"), "utf8"));

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

function between(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

console.log("\n[1] deterministic conversation shape");
check("uses exactly four questions", ONBOARDING_QUESTIONS.length === 4);
check("questions collect self, decision, people, context in order", ONBOARDING_QUESTIONS.map((q) => q.id).join(",") === "self,decision,people,context");
check("only the last question is skippable", !ONBOARDING_QUESTIONS.slice(0, 3).some((q) => q.skippable) && ONBOARDING_QUESTIONS[3].skippable === true);

console.log("\n[2] trigger guard");
const emptyRooms = [{ id: "empty", rosterIds: [] }];
const usableRooms = [{ id: "usable", rosterIds: ["maya"] }];
const noDecisions = () => [];
const activeDecision = () => [{ id: "d1", status: "active", participantIds: ["maya"], externalIds: [] }];
check("empty account is not usable", hasUsableRoom(emptyRooms, noDecisions) === false);
check("room with people and active decision is usable", hasUsableRoom(usableRooms, activeDecision) === true);
check("new account marker starts once", shouldAutoStartOnboarding({ pending: true, prompted: false, usableRoom: false }) === true);
check("existing content blocks auto-start", shouldAutoStartOnboarding({ pending: true, prompted: false, usableRoom: true }) === false);
check("prompted user does not get repeated auto-start", shouldAutoStartOnboarding({ pending: true, prompted: true, usableRoom: false }) === false);

console.log("\n[3] command plan");
const plan = buildOnboardingCommandPlan(fixture.answers);
check("plan reuses create, grid, network commands", plan.map((p) => p.command).join(",") === "create,grid,network");
check("plan carries the decision answer", plan.every((p) => p.text.includes("Q3 AI feature")));
check("plan carries the self answer for operator mapping", plan.every((p) => p.text.includes("product manager driving this")));
check("network still runs when the last question is skipped", buildOnboardingCommandPlan({ ...fixture.answers, context: "" }).map((p) => p.command).join(",") === "create,grid,network");

const seed = deriveDecisionSeed(fixture.answers.decision);
check("decision title is derived", seed.title.includes("Q3 AI feature"));
check("decision context preserves the answer", seed.context.deciding.includes("narrower launch"));

console.log("\n[4] mocked command outputs");
const create = normalizeRoomUpdate(fixture.mockUpdates.create);
const grid = normalizeRoomUpdate(fixture.mockUpdates.grid);
const network = normalizeRoomUpdate(fixture.mockUpdates.network);
check("create output creates at least one person", create.people.filter((p) => p.create).length >= 1);
check("grid output has calibrated values", grid.people.every((p) => between(p.power, 25, 80) && between(p.interest, 45, 80)));
check("grid output carries confidence", grid.people.every((p) => p.confidence));
check("network output only maps stated edges", network.edges.length <= 2);
check("network output includes reporting line", network.edges.some((e) => e.from === "Maya" && e.to === "Sam" && e.type === "defers"));
check("network output includes stated friction", network.edges.some((e) => e.from === "Dana" && e.to === "Maya" && e.type === "conflict"));

console.log("\n[5] Phase A: extraction quality");
// Room name: a short human title, never the raw pasted paragraph or a "room" suffix.
const messyTitle = deriveDecisionTitle(fixture.messy.decision);
check("messy decision yields a short title", messyTitle.length > 0 && messyTitle.length <= 56);
check("title is not the raw paragraph", messyTitle !== fixture.messy.decision && messyTitle.length < fixture.messy.decision.length);
check("title strips lead-in filler", !/^i need to/i.test(messyTitle) && !/^we need to/i.test(messyTitle));
check("room name does not carry a 'room' suffix word", !/ room$/i.test(deriveDecisionSeed(fixture.messy.decision).roomName));
check("derived title matches the golden", messyTitle === fixture.messy.expectedTitle);

// Participants: every extracted person from @create is created (force-create),
// so building never lands on "No participants" when a create flag is missing.
const forced = forceCreatePeople(normalizeRoomUpdate(fixture.createMissingFlag));
check("force-create flags every named person", forced.people.every((p) => p.create === true) && forced.people.length === 3);

// Dedup: a role-only mention resolves to the existing roster person instead of
// creating a phantom duplicate (reuses findPersonRef / resolvePersonRef).
const roster = fixture.dedupRoster;
check("role mention resolves to existing person", resolvePersonRef("the head of engineering", [roster])?.id === "p_robert");
check("bare role label resolves to existing person", resolvePersonRef("Head of Engineering", [roster])?.id === "p_robert");
check("unrelated name does not resolve to a duplicate", resolvePersonRef("Susan", [roster]) === null);

console.log("\n[6] Phase B: four-question flow and closing");
const noDash = (s) => !/[—–]/.test(s);
// Four questions in the fixed order; only the last is skippable. The prompts are
// the product owner's verbatim copy and intentionally use em dashes.
check("Q1 asks who the operator is", /who are you/i.test(ONBOARDING_QUESTIONS[0].prompt));
check("Q2 asks the decision and the good outcome", /good outcome/i.test(ONBOARDING_QUESTIONS[1].prompt));
check("Q3 asks who can make or break it", /make or break/i.test(ONBOARDING_QUESTIONS[2].prompt));
check("Q4 (everything else) is skippable", /anything else/i.test(ONBOARDING_QUESTIONS[3].prompt) && ONBOARDING_QUESTIONS[3].skippable === true);
// Closing summary names what it built, specifically and without em dashes.
const closing = buildClosingSummary({ names: ["Robert", "Head of Engineering", "Head of UX", "Susan"], placedCount: 4, edgeCount: 2 });
check("closing names the people", closing.startsWith("Mapped Robert, Head of Engineering, Head of UX, and Susan"));
check("closing names Energy and relationships", /set initial Energy/.test(closing) && /drew the relationships/.test(closing) && noDash(closing));

console.log("\n[7] Phase C: robust first-run detection");
// A seeded-but-empty room (active decision, no people) is not usable, so a
// genuine first run still triggers.
const seededEmpty = [{ id: "seed", rosterIds: [] }];
const seededEmptyDecisions = () => [{ id: "d0", status: "active", participantIds: [], externalIds: [] }];
check("empty seeded room is not usable", hasUsableRoom(seededEmpty, seededEmptyDecisions) === false);
check("first run with only an empty room triggers", shouldAutoStartOnboarding({ pending: true, prompted: false, usableRoom: hasUsableRoom(seededEmpty, seededEmptyDecisions) }) === true);
// A room whose only decision is archived is not usable.
const archivedOnly = () => [{ id: "d1", status: "archived", participantIds: ["maya"], externalIds: [] }];
check("archived-only room is not usable", hasUsableRoom([{ id: "r", rosterIds: ["maya"] }], archivedOnly) === false);
// A user with real content never sees first-run, even if the marker is pending.
check("real content never auto-starts", shouldAutoStartOnboarding({ pending: true, prompted: false, usableRoom: true }) === false);
check("no pending marker never auto-starts", shouldAutoStartOnboarding({ pending: false, prompted: false, usableRoom: false }) === false);

console.log("\n[8] Phase D: one engine, two framings");
// First-run carries the product intro; the returning-user door does not.
check("first-run intro frames the product", /situation room/i.test(ONBOARDING_INTRO));
check("returning intro drops the product pitch", !/situation room/i.test(ONBOARDING_INTRO_RETURNING));
check("returning intro is shorter and to the point", ONBOARDING_INTRO_RETURNING.length < ONBOARDING_INTRO.length);
check("both framings promise the same four questions", /four quick questions/i.test(ONBOARDING_INTRO) && /four quick questions/i.test(ONBOARDING_INTRO_RETURNING));

console.log(`\nOnboarding verification: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("Failed:", failures.join("; "));
  process.exit(1);
}

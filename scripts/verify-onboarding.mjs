#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ONBOARDING_QUESTIONS,
  buildOnboardingCommandPlan,
  deriveDecisionSeed,
  hasUsableRoom,
  relationshipAnswerIsEmpty,
  shouldAutoStartOnboarding,
} from "../src/lib/onboarding.js";
import { normalizeRoomUpdate } from "../src/lib/room-command-contract.js";

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
check("uses exactly three questions", ONBOARDING_QUESTIONS.length === 3);
check("questions collect decision, people, and relationships", ONBOARDING_QUESTIONS.map((q) => q.id).join(",") === "decision,people,relationships");
check("relationship skip is accepted", relationshipAnswerIsEmpty("skip") && relationshipAnswerIsEmpty("none"));

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
check("network command is omitted when relationships are skipped", buildOnboardingCommandPlan({ ...fixture.answers, relationships: "skip" }).map((p) => p.command).join(",") === "create,grid");

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

console.log(`\nOnboarding verification: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("Failed:", failures.join("; "));
  process.exit(1);
}

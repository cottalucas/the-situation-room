#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePlay } from "../src/lib/play-contract.js";
import { normalizeRoomUpdate, normalizeStrategistAnswer } from "../src/lib/room-command-contract.js";
import { COMMAND_PROMPT_VERSION, PLAY_PROMPT_VERSION, STRATEGIST_PROMPT_VERSION } from "../src/lib/llm-prompts.js";

// Diagnosis and trait vocabulary the grounded strategist must never use.
const BANNED_TRAIT_TERMS = [
  "narcissist", "narcissistic", "psychopath", "sociopath", "introvert", "extrovert",
  "personality type", "personality disorder", "neurotic", "bipolar", "adhd", "ocd",
  "autistic", "on the spectrum", "mental health", "diagnos", "toxic person", "low iq",
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(root, "evals", "fixtures", "v1.json");
const runsDir = path.join(root, "evals", "runs");
const live = process.argv.includes("--live");
const maxCases = Number(process.env.EVAL_MAX_CASES || 0);
const caseIds = new Set(
  String(process.env.EVAL_CASE_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

if (live && process.env.EVAL_ALLOW_LIVE !== "true") {
  console.error("Live evals spend LLM credits. Set EVAL_ALLOW_LIVE=true and pass --live to run them.");
  process.exit(2);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Extract a top-level `function name(...) { ... }` as source text by walking
// braces from the opening brace. commandSchema contains no braces inside string
// literals or comments, so plain brace matching is sufficient here.
function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in source`);
  let depth = 0;
  let started = false;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") { depth += 1; started = true; }
    else if (ch === "}") { depth -= 1; if (started && depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error(`Unbalanced braces extracting ${name}`);
}

// Close the schema-drift class of bug: src/lib/llm-prompts.js (dev) and
// functions/index.js (production) each keep their own commandSchema(). They must
// render byte-identical JSON for every command, or production shows Haiku a
// different target shape than dev. We extract both functions as text and compare
// their JSON.stringify output, without importing functions/index.js (which runs
// Firebase side effects at load).
function commandSchemaSyncChecks() {
  const srcText = fs.readFileSync(path.join(root, "src", "lib", "llm-prompts.js"), "utf8");
  const fnText = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
  // eslint-disable-next-line no-eval
  const srcSchema = (0, eval)(`(${extractFunctionSource(srcText, "commandSchema")})`);
  // eslint-disable-next-line no-eval
  const fnSchema = (0, eval)(`(${extractFunctionSource(fnText, "commandSchema")})`);
  const commands = ["note", "grid", "network", "map", "create", "other"];
  return commands.map((command) => {
    const a = JSON.stringify(srcSchema(command), null, 2);
    const b = JSON.stringify(fnSchema(command), null, 2);
    return [`commandSchema_sync_${command}`, a === b];
  });
}

function asText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function flattenText(value) {
  if (!value || typeof value !== "object") return asText(value);
  return Object.values(value)
    .map((v) => (Array.isArray(v) ? v.map(flattenText).join(" ") : flattenText(v)))
    .join(" ");
}

function hasForbidden(candidate, forbiddenTerms = []) {
  const text = flattenText(candidate).toLowerCase();
  return forbiddenTerms.filter((term) => text.includes(String(term).toLowerCase()));
}

function participantIds(playInput) {
  return new Set((playInput.context?.participants || []).map((p) => p.id));
}

function peopleIds(commandInput) {
  return new Set((commandInput.context?.people || []).map((p) => p.id));
}

function scorePlay(testCase, candidate) {
  const normalized = normalizePlay(candidate, testCase.input.context.participants);
  const checks = [];
  const expect = testCase.expect || {};
  const ids = participantIds(testCase.input);

  checks.push(["schema_valid", Boolean(normalized)]);
  if (!normalized) return checks;

  checks.push(["play_focus_steps", normalized.steps.length >= (expect.minSteps || 2)]);
  checks.push(["risk_present", Boolean(normalized.risk?.text && normalized.risk?.signal)]);
  checks.push(["reasoning_present", normalized.reasoning.length > 0]);
  checks.push(["sequence_grounded", normalized.sequence.every((id) => ids.has(id))]);
  (expect.requiredPeople || []).forEach((id) => {
    const found = normalized.steps.some((step) => step.person === id) || normalized.sequence.includes(id);
    checks.push([`required_person_${id}`, found]);
  });
  checks.push(["forbidden_terms_absent", hasForbidden(normalized, expect.forbiddenTerms).length === 0]);
  checks.push(["not_generic", /SCARF|Cialdini|Fisher|Thomas/i.test(flattenText(normalized))]);
  return checks;
}

function scoreCommand(testCase, candidate) {
  const normalized = normalizeRoomUpdate(candidate);
  const checks = [];
  const expect = testCase.expect || {};
  const ids = peopleIds(testCase.input);

  checks.push(["schema_valid", Boolean(normalized)]);
  if (!normalized) return checks;

  (expect.requiredPeople || []).forEach((id) => {
    const found = normalized.people.some((p) => p.id === id || p.name?.toLowerCase() === id);
    checks.push([`required_person_${id}`, found || ids.has(id)]);
  });
  if (expect.requireNote) checks.push(["note_present", normalized.people.some((p) => p.note)]);
  if (expect.requireFrameworkSignal) {
    checks.push(["framework_signal_present", normalized.people.some((p) => p.profilePatch?.baseRead || p.profilePatch?.visualTags)]);
  }
  if (expect.requireGrid) {
    checks.push(["grid_present", normalized.people.some((p) => p.power != null && p.interest != null)]);
  }
  if (expect.noGrid) {
    checks.push(["grid_absent", normalized.people.every((p) => p.power == null && p.interest == null)]);
  }
  if (expect.requireOpenQuestion) checks.push(["open_question_present", normalized.openQuestions.length > 0]);
  if (expect.requireConfidence) {
    checks.push([
      "confidence_present",
      normalized.people.some((p) => p.confidence) || normalized.edges.some((e) => e.confidence),
    ]);
  }
  if (expect.gridBands) {
    Object.entries(expect.gridBands).forEach(([pid, bands]) => {
      const person = normalized.people.find((p) => p.id === pid || p.name?.toLowerCase() === pid);
      ["power", "interest"].forEach((axis) => {
        if (!bands[axis]) return;
        const [min, max] = bands[axis];
        const value = person?.[axis];
        checks.push([`grid_band_${pid}_${axis}`, value != null && value >= min && value <= max]);
      });
    });
  }
  if (expect.minEdges != null) checks.push(["edge_count", normalized.edges.length >= expect.minEdges]);
  if (expect.maxEdges != null) checks.push(["edge_count_max", normalized.edges.length <= expect.maxEdges]);
  (expect.requiredEdges || []).forEach((edge, index) => {
    const found = normalized.edges.some((e) => e.from === edge.from && e.to === edge.to && e.type === edge.type);
    checks.push([`required_edge_${index + 1}_${edge.from}_${edge.to}_${edge.type}`, found]);
  });
  checks.push(["notes_concise", normalized.people.every((p) => !p.note || p.note.length <= 240)]);
  checks.push(["open_questions_bounded", normalized.openQuestions.length <= 2]);
  checks.push(["forbidden_terms_absent", hasForbidden(normalized, expect.forbiddenTerms).length === 0]);
  return checks;
}

function scoreStrategist(testCase, candidate) {
  const people = testCase.input.context?.people || [];
  const normalized = normalizeStrategistAnswer(candidate, people);
  const checks = [];
  const expect = testCase.expect || {};
  const ids = peopleIds(testCase.input);

  checks.push(["schema_valid", Boolean(normalized)]);
  if (!normalized) return checks;

  checks.push(["cites_grounded", normalized.cites.every((id) => ids.has(id))]);
  checks.push(["no_trait_diagnosis_vocab", hasForbidden(normalized, BANNED_TRAIT_TERMS).length === 0]);
  checks.push(["forbidden_terms_absent", hasForbidden(normalized, expect.forbiddenTerms).length === 0]);
  // Moves are objects { move, framework? }. The framework lever is optional and,
  // when present, is a non-empty string: an unsupported lever is omitted, not faked.
  checks.push(["moves_are_objects", normalized.moves.every((m) => m && typeof m === "object" && typeof m.move === "string" && m.move.length > 0)]);
  checks.push([
    "framework_optional_when_present",
    normalized.moves.every((m) => !("framework" in m) || (typeof m.framework === "string" && m.framework.length > 0)),
  ]);
  if (expect.requireCites) checks.push(["cites_present", normalized.cites.length > 0]);
  if (expect.requireMoves) checks.push(["moves_present", normalized.moves.length > 0]);
  if (expect.expectDecline) {
    checks.push(["declines_off_topic", normalized.grounded === false]);
    checks.push(["decline_has_no_moves", normalized.moves.length === 0]);
  }
  checks.push(["no_em_dash", !/[—–]/.test(flattenText(normalized))]);
  (expect.requiredPeople || []).forEach((id) => {
    const inCites = normalized.cites.includes(id);
    const inText = flattenText(normalized).toLowerCase().includes(String(id).toLowerCase());
    checks.push([`required_person_${id}`, inCites || inText]);
  });
  return checks;
}

async function runLive(testCase) {
  const baseUrl = process.env.EVAL_BASE_URL || "http://127.0.0.1:5173";
  const endpoint =
    testCase.kind === "play"
      ? "/api/generate-play"
      : testCase.kind === "strategist"
        ? "/api/strategist"
        : "/api/interpret-room-command";
  const payload =
    testCase.kind === "play"
      ? { situation: testCase.input.situation, context: testCase.input.context }
      : testCase.kind === "strategist"
        ? { question: testCase.input.question, context: testCase.input.context }
        : {
            command: testCase.input.command,
            text: testCase.input.text,
            focusPerson: testCase.input.focusPerson || null,
            context: testCase.input.context,
          };
  const started = Date.now();
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  const latencyMs = Date.now() - started;
  if (!res.ok) return { candidate: null, error: body.error || `HTTP ${res.status}`, latencyMs, meta: body.meta || null };
  const candidate = testCase.kind === "play" ? body.play : testCase.kind === "strategist" ? body.answer : body.update;
  return {
    candidate,
    error: null,
    latencyMs,
    meta: body.meta || null,
  };
}

async function main() {
  const suite = readJson(fixturePath);
  const cases = suite.cases
    .filter((testCase) => (caseIds.size ? caseIds.has(testCase.id) : true))
    .slice(0, maxCases > 0 ? maxCases : undefined);
  const results = [];

  for (const testCase of cases) {
    const liveResult = live ? await runLive(testCase) : null;
    const candidate = live ? liveResult.candidate : testCase.golden;
    const checks =
      testCase.kind === "play"
        ? scorePlay(testCase, candidate)
        : testCase.kind === "strategist"
          ? scoreStrategist(testCase, candidate)
          : scoreCommand(testCase, candidate);
    if (liveResult?.error) checks.push(["live_call_succeeded", false]);
    const passed = checks.every(([, ok]) => Boolean(ok));
    results.push({
      id: testCase.id,
      kind: testCase.kind,
      tags: testCase.tags || [],
      passed,
      checks: Object.fromEntries(checks),
      error: liveResult?.error || null,
      latencyMs: liveResult?.latencyMs || 0,
      meta: liveResult?.meta || null,
    });
  }

  // Static drift guard: src/ and functions/ commandSchema must render identically.
  // Runs in every mode; it reads files, never the network.
  const syncChecks = commandSchemaSyncChecks();
  results.push({
    id: "sync-commandSchema-src-vs-functions",
    kind: "sync",
    tags: ["sync", "schema_drift"],
    passed: syncChecks.every(([, ok]) => Boolean(ok)),
    checks: Object.fromEntries(syncChecks),
    error: null,
    latencyMs: 0,
    meta: null,
  });

  const summary = {
    suite: suite.version,
    mode: live ? "live" : "offline",
    promptVersions: { play: PLAY_PROMPT_VERSION, command: COMMAND_PROMPT_VERSION, strategist: STRATEGIST_PROMPT_VERSION },
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).map((r) => r.id),
    ts: new Date().toISOString(),
    results,
  };

  fs.mkdirSync(runsDir, { recursive: true });
  fs.writeFileSync(path.join(runsDir, "latest.json"), JSON.stringify(summary, null, 2));

  console.log(`${summary.mode} eval: ${summary.passed}/${summary.total} passed`);
  if (summary.failed.length) {
    summary.failed.forEach((id) => {
      const result = results.find((r) => r.id === id);
      const failedChecks = Object.entries(result.checks)
        .filter(([, ok]) => !ok)
        .map(([name]) => name)
        .join(", ");
      console.log(`- ${id}: ${failedChecks}${result.error ? ` (${result.error})` : ""}`);
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

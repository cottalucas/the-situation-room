/**
 * @play readiness. A deterministic, client-side gate that decides whether the
 * room holds enough structural signal for a grounded play, computed entirely from
 * existing Firestore data. The model never judges sufficiency; the validator and
 * the app do.
 *
 * Readiness requires:
 *  (a) at least two participants, where the signed-in user (isSelf) counts as one,
 *      so "you + 1 other" passes.
 *  (b) every participant has a real stance: for, against, or neutral.
 *  (c) every non-self participant is placed on the Energy (power/interest) grid.
 * Network edges are NOT required at any participant count.
 *
 * Reason codes for the play_blocked event, in priority order:
 *  missing_people -> missing_stance -> missing_grid.
 */

const VALID_STANCES = new Set(["for", "against", "neutral"]);

// The createDecision default placement (data/seed.js DEFAULT_PLACEMENT). A chip
// still sitting on the exact default has not been placed by the user or a command.
const DEFAULT_POWER = 50;
const DEFAULT_INTEREST = 55;

export const PLAY_BLOCK_REASONS = {
  PEOPLE: "missing_people",
  STANCE: "missing_stance",
  GRID: "missing_grid",
};

/**
 * A participant is "placed" when their grid placement carries an explicit
 * confidence (it came from a command or a manual drag through buildPlacement) or
 * differs from the seeded default. An absent placement is unplaced.
 */
export function isPlaced(placement) {
  if (!placement) return false;
  const { power, interest, confidence } = placement;
  if (power == null || interest == null) return false;
  if (confidence) return true;
  return power !== DEFAULT_POWER || interest !== DEFAULT_INTEREST;
}

/**
 * @param {Object} args
 * @param {Array}  args.participants  resolved participant people (self included)
 * @param {Object} args.decision      the active decision (positions, placements)
 * @returns {{ ready: boolean, reason: string|null, missing: string[] }}
 */
export function checkPlayReadiness({ participants = [], decision } = {}) {
  const positions = decision?.positions || {};
  const placements = decision?.placements || {};

  if ((participants || []).length < 2) {
    return { ready: false, reason: PLAY_BLOCK_REASONS.PEOPLE, missing: [] };
  }

  const missingStance = participants.filter((p) => !VALID_STANCES.has(positions[p.id]));
  if (missingStance.length) {
    return { ready: false, reason: PLAY_BLOCK_REASONS.STANCE, missing: missingStance.map((p) => p.id) };
  }

  const missingGrid = participants.filter((p) => !p.isSelf && !isPlaced(placements[p.id]));
  if (missingGrid.length) {
    return { ready: false, reason: PLAY_BLOCK_REASONS.GRID, missing: missingGrid.map((p) => p.id) };
  }

  return { ready: true, reason: null, missing: [] };
}

function shortName(person) {
  if (!person) return "someone";
  if (person.isSelf) return "you";
  return String(person.name || "").trim().split(/\s+/)[0] || "they";
}

function joinNames(names) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return "a couple of people";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, 2).join(", ")}, and ${list.length - 2} more`;
}

/**
 * A conversational, coach-style turn that names the biggest gap in plain language
 * and asks one or two questions to close it. It never asks raw framework questions
 * ("what is this person's interest"); it asks how someone feels or how much weight
 * they carry. Deterministic on purpose: no second model surface that could invent
 * a fact about a real colleague. The free-text reply is parsed back through the
 * same @map command path.
 */
export function buildPlayCoaching(readiness, participants = []) {
  const byId = (id) => (participants || []).find((p) => p.id === id);

  if (readiness.reason === PLAY_BLOCK_REASONS.PEOPLE) {
    return {
      body: "I can build a play once at least two people are on this decision, and you count as one. Tell me who else is in the room.",
      questions: ["Who else can make or break this call? A name and roughly what they do is enough."],
    };
  }

  if (readiness.reason === PLAY_BLOCK_REASONS.STANCE) {
    const targets = readiness.missing.map(byId).filter(Boolean);
    const named = targets.map(shortName);
    const first = targets[0];
    const second = targets[1];
    const questions = [
      first
        ? `How does ${shortName(first)} feel about this one, behind it or pushing back?`
        : "Where does each person stand, for, against, or neutral?",
    ];
    if (second) questions.push(`And ${shortName(second)}, where do they land?`);
    return {
      body: `Before I read the room I need where people stand. I do not have a stance yet for ${joinNames(named)}.`,
      questions: questions.slice(0, 2),
    };
  }

  // missing_grid
  const targets = readiness.missing.map(byId).filter(Boolean);
  const named = targets.map(shortName);
  const first = targets[0];
  return {
    body: `Almost there. I still need a feel for how much ${joinNames(named)} can move this decision.`,
    questions: [
      first
        ? `How much can ${shortName(first)} actually sway this call, and how much do they care about it?`
        : "Who carries the real weight here, and who barely cares?",
    ],
  };
}

/**
 * Decide what to do after a coaching reply, given the new readiness and the prior
 * coaching turn. Keeps the loop terminating: an honest "I don't know" about a
 * stance must not re-ask the same person forever.
 *  - ready: the gap is closed, prompt to run @play.
 *  - recoach: progress was made (or there is room to ask once more); ask again.
 *  - neutralize: the user answered twice without a clear stance, so read the
 *    still-unknown people as neutral and proceed (transparent fallback).
 *  - manual: a non-stance gap could not be closed by chat; point to the lens.
 *
 * @param {Object} args
 * @param {{ready:boolean,reason:string|null,missing:string[]}} args.readiness  the re-check
 * @param {{reason:string,missing:string[],attempts:number}} [args.prev]        the prior turn
 */
export function nextCoachingStep({ readiness, prev }) {
  if (readiness.ready) return { kind: "ready" };
  const prevMissing = prev?.missing || [];
  const sameReason = Boolean(prev) && prev.reason === readiness.reason;
  const shrank = readiness.missing.length < prevMissing.length;
  if (!sameReason || shrank) return { kind: "recoach", attempts: 0 };
  const attempts = (prev?.attempts || 0) + 1;
  if (attempts < 2) return { kind: "recoach", attempts };
  if (readiness.reason === PLAY_BLOCK_REASONS.STANCE) return { kind: "neutralize", ids: readiness.missing };
  return { kind: "manual", reason: readiness.reason };
}

/** A short, frozen timestamp label for a generated play card. */
export function playStamp(date = new Date()) {
  try {
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

/** The grounded situation string handed to the play generator. */
export function playSituation(decision) {
  const c = decision?.context || {};
  const parts = [decision?.title, c.deciding, c.goal ? `Goal: ${c.goal}` : "", c.constraint ? `Constraint: ${c.constraint}` : ""]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return parts.join(". ") || "Get this decision through the room.";
}

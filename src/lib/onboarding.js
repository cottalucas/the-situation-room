export const ONBOARDING_QUESTIONS = [
  {
    id: "self",
    prompt: "First — who are you in this? Your role, who you report to, and where you sit in this decision.",
  },
  {
    id: "decision",
    prompt: "What's the decision you're trying to get through, and what would a good outcome actually look like?",
  },
  {
    id: "people",
    prompt:
      "Who can make or break this? Names, what they do, how they relate — who's aligned, who leans on whom, who influences whom, and who actually holds the power here.",
  },
  {
    id: "context",
    prompt: "Anything else that's relevant — history, timing, constraints, politics, whatever shapes this room.",
    skippable: true,
  },
  {
    id: "roomName",
    prompt: "Last one — what should we call this room? A short name you'll recognize later.",
    skippable: true,
  },
];

// Question ids that run through the relay to build the room. roomName is a plain
// label step, so it is not in this set.
export const ONBOARDING_PIPELINE_STEPS = new Set(["self", "decision", "people", "context"]);

// First-run framing carries a one-line product intro. The returning-user door
// ("+ New room") reuses the same engine without it.
export const ONBOARDING_INTRO =
  "The Situation Room maps the people behind a decision and helps you plan how to move the room. I'll build your first map one answer at a time as you go.";

export const ONBOARDING_INTRO_RETURNING =
  "Let's map a new decision. I'll build the room one answer at a time as you go.";

function cleanAnswer(value, max = 1200) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clipSentence(value, max) {
  const clean = cleanAnswer(value, max * 2);
  const first = clean.split(/[.!?]/).find(Boolean) || clean;
  if (first.length <= max) return first;
  return `${first.slice(0, max - 3).trim()}...`;
}

export function relationshipAnswerIsEmpty(value) {
  const clean = cleanAnswer(value, 160).toLowerCase();
  return !clean || /^(skip|none|no|not sure|nothing|n\/a|na)$/i.test(clean);
}

// Lead-ins people type before naming the actual decision. Stripped so the title
// is the decision itself, never "I need to get the ...".
const FILLER_LEAD_INS = [
  /^(i|we)\s*'?(m|re)\s+(trying|hoping|looking|deciding|figuring\s+out)\s+(whether\s+|if\s+|how\s+)?to\s+/i,
  /^(i|we)\s+(am|are)\s+(trying|hoping|looking|deciding)\s+(whether\s+|if\s+|how\s+)?to\s+/i,
  /^(i|we)\s+(really\s+)?(need|want|have|hope|would\s+like|'?d\s+like)\s+to\s+/i,
  /^the\s+(decision|question|goal|aim|call|ask)\s+is\s+(whether\s+|about\s+|to\s+)?/i,
  /^how\s+(do|can|should)\s+(i|we)\s+/i,
  /^should\s+(i|we)\s+/i,
  /^trying\s+to\s+/i,
  /^help\s+me\s+/i,
  /^figure\s+out\s+(whether|if|how)\s+/i,
  /^i\s+(need|want|have)\s+/i,
  /^we\s+(need|want|have)\s+/i,
];

function stripFiller(text) {
  let t = String(text || "").trim();
  for (let guard = 0; guard < 4; guard += 1) {
    let changed = false;
    for (const re of FILLER_LEAD_INS) {
      const next = t.replace(re, "");
      if (next !== t) {
        t = next.trim();
        changed = true;
      }
    }
    if (!changed) break;
  }
  return t;
}

function firstClause(text) {
  // Cut at the first hard break or a trailing rationale conjunction.
  const cut = text.split(/[,.;:!?]| but | because | so that | so we | and then /i)[0];
  return (cut || text).trim();
}

function capFirst(text) {
  const t = String(text || "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function capWords(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).trim();
}

const TITLE_MAX = 56;

/**
 * A short, human room/decision title derived from the raw decision answer.
 * Strips lead-in filler, keeps the first clause, caps at a word boundary, and
 * adds a question mark when the decision reads as a yes/no call. Never returns
 * the raw paragraph.
 */
export function deriveDecisionTitle(decisionAnswer) {
  const clean = cleanAnswer(decisionAnswer, 1600);
  if (!clean) return "First decision";
  const core = firstClause(stripFiller(clean)) || firstClause(clean) || clean;
  let title = capFirst(capWords(core, TITLE_MAX));
  if (!title) return "First decision";
  title = title.replace(/[\s.,;:]+$/, "");
  const isQuestion = /\b(whether|should\s+(i|we)|do\s+we|can\s+we)\b/i.test(clean) || /\?/.test(core);
  if (isQuestion && !/[?]$/.test(title)) title = `${title}?`;
  return title;
}

/**
 * True when the derived title is too thin to trust without a quick confirm:
 * empty answer, a title that got hard-truncated, or a title that is basically
 * the whole answer with no shape. Drives the one short naming confirm.
 */
export function decisionSeedNeedsConfirm(decisionAnswer) {
  const clean = cleanAnswer(decisionAnswer, 1600);
  if (!clean) return true;
  const title = deriveDecisionTitle(decisionAnswer);
  if (title === "First decision") return true;
  // Truncated hard against the cap, or only one bare word.
  const wordCount = title.replace(/[?]/g, "").trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 2) return true;
  if (title.length >= TITLE_MAX - 2 && clean.length > TITLE_MAX) return true;
  return false;
}

export function deriveDecisionSeed(decisionAnswer, nameOverride) {
  // Store the decision answer intact, never truncated; the title is the only
  // shortened derivation.
  const full = sanitizeAnswer(decisionAnswer);
  const title = cleanAnswer(nameOverride, TITLE_MAX) || deriveDecisionTitle(decisionAnswer);
  return {
    roomName: title,
    title,
    context: {
      deciding: full,
      goal: full,
      constraint: "",
    },
  };
}

/**
 * Guarantee every extracted person from the @create pass is created and so
 * becomes a participant. The model should set create: true, but a named person
 * with the flag missing must never be silently dropped. Resolution against
 * existing people still happens at apply time, so this does not create
 * duplicates.
 */
export function forceCreatePeople(update) {
  if (!update || !Array.isArray(update.people)) return update;
  return {
    ...update,
    people: update.people.map((p) => ({ ...p, create: p.create || Boolean(p.name) })),
  };
}

// Per-step lead-in for the sequenced flow. Each guided-setup answer is run
// through the relay on its own (against the room built so far), so the room
// grows one answer at a time instead of one batch pass at the end.
const STEP_LEADS = {
  self:
    "This is the operator describing themselves. Resolve them to the existing isSelf user; never create a second person for the operator. Set the operator's role and add an edge for who they report to. Only create another person if the operator explicitly names someone. ",
  decision:
    "This describes the decision and the desired outcome. Do not create a person from a generic function or team name such as Sales, Finance, or Engineering; only create a person if a specific individual is named. ",
  people:
    "Create one person for each distinct individual named or described. Use the person's name; when only a role is given, for example \"the head of engineering\", use that role as the name and set it as the role. Resolve anyone already in the room instead of creating a duplicate. ",
  context:
    "This adds history, timing, constraints, and politics. Enrich the people already in the room with any stance, power, interest, influence, or relationship it supports. Resolve to existing people; do not create duplicates. ",
};

/**
 * Build the single relay command for one guided-setup answer. Returns null for
 * the room-name step or an empty answer (nothing to run through the pipeline).
 * Uses the comprehensive @map shape so each answer can add people, grid reads,
 * influence, and relationships, resolved against the people already in the room.
 */
export function buildOnboardingStepCommand(questionId, answer) {
  const text = sanitizeAnswer(answer);
  if (!text || !ONBOARDING_PIPELINE_STEPS.has(questionId)) return null;
  return {
    command: "map",
    text:
      (STEP_LEADS[questionId] || "") +
      "For every person, extract every read the text actually supports: stance toward the decision (for, against, neutral, or unknown), power and interest using the calibrated bands, influence over this decision, a short note in the operator's words, and any relationship the text states or strongly implies (who reports to whom, who is aligned, who leans on whom, who holds the power). " +
      "Leave a field out when the text gives no signal for it. Never invent a person, a placement, a stance, an influence level, or a relationship the text does not support. " +
      "Operator's words: " + text,
  };
}

function firstSentence(text, max = 120) {
  const clean = cleanAnswer(text, 600);
  if (!clean) return "";
  const sentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  return capWords(sentence.replace(/[.\s]+$/, ""), max);
}

/**
 * One short, grounded sentence that reflects back what the user just said before
 * the next question. It echoes the user's own salient words, so it stays
 * specific and never invents a fact. This is deterministic on purpose: it adds
 * no model surface and cannot hallucinate. (A Haiku-written reflection is
 * flagged as a deferred enhancement.)
 */
export function reflectOnAnswer(questionId, answer) {
  if (questionId === "relationships" && relationshipAnswerIsEmpty(answer)) {
    return "No relationships yet, that's fine. I'll start from the people.";
  }
  const fragment = firstSentence(answer);
  if (!fragment) return "";
  if (questionId === "decision") {
    return `So this is the decision: ${deriveDecisionTitle(answer)}.`;
  }
  if (questionId === "people") {
    return `So ${capFirst(fragment)}, noted.`;
  }
  return `Noted: ${capFirst(fragment)}.`;
}

/**
 * The one short naming confirm shown before building. Pre-fills the derived
 * title and asks the user to keep or rename it. Never shows the raw paragraph.
 */
export function namingPrompt(decisionAnswer) {
  const title = deriveDecisionTitle(decisionAnswer);
  if (decisionSeedNeedsConfirm(decisionAnswer)) {
    return `Before I build, what should I call this room? A short name for the decision works best.`;
  }
  return `I'll call this room "${title}". Keep it, or type a better name.`;
}

function joinNames(names) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

/**
 * The closing message names what it built specifically: the people it mapped,
 * whether it set initial Energy, and whether it drew relationships.
 */
export function buildClosingSummary({ names = [], placedCount = 0, edgeCount = 0 } = {}) {
  const parts = [];
  parts.push(names.length ? `Mapped ${joinNames(names)}` : "Built your room");
  if (placedCount) parts.push("set initial Energy");
  if (edgeCount) parts.push(`drew the ${edgeCount === 1 ? "relationship" : "relationships"} you mentioned`);
  return `${parts.join("; ")}.`;
}

// Like cleanAnswer but never truncates: a guided-setup answer may be a long
// paragraph and must reach the Mapper intact. Only control chars are stripped and
// whitespace collapsed.
function sanitizeAnswer(value) {
  return cleanAnswer(value, Number.MAX_SAFE_INTEGER);
}

export function buildOnboardingCommandPlan(answers) {
  // Never truncate the operator's words. Long paragraphs go to the Mapper intact.
  const self = sanitizeAnswer(answers.self);
  const decision = sanitizeAnswer(answers.decision);
  const people = sanitizeAnswer(answers.people);
  const context = sanitizeAnswer(answers.context);
  // Every step reads all four answers. Stance, power, interest, and influence
  // signal is spread across them, so extraction is never question-locked.
  const answersBlock =
    `Who the operator is (resolve first-person references such as I, me, my to the isSelf user, set their role, and capture who they report to as an edge): ${self || "not stated"} ` +
    `The decision and the desired outcome: ${decision} ` +
    `The people, how they relate, and who holds the power: ${people} ` +
    `Anything else relevant (history, timing, constraints, politics): ${context || "none stated"}`;
  return [
    {
      command: "create",
      text:
        `Build this room from the operator's guided-setup answers below, in one comprehensive pass. ` +
        `Create one person for each distinct individual named or described across ALL FOUR answers. Use the person's name when given. When only a role is given, for example "the head of engineering", use that role as the name and set it as the role. Do not list the same person twice, and do not create a separate role-person for someone already named with that role. ` +
        `Resolve the operator (I, me, my, the person answering who they are) to the existing isSelf user: set the operator's role and add an edge for who they report to. Never create a second person for the operator. ` +
        `For every person, extract every read the text actually supports: stance toward the decision (for, against, neutral, or unknown), power and interest using the calibrated bands, influence over this decision, a short note in the user's own words, and any relationship the text states or strongly implies (who reports to whom, who is aligned, who leans on whom, who holds the power). ` +
        `Pull this signal from all four answers, not one. Leave a field out when the text gives no signal for it. Never invent a person, a placement, a stance, an influence level, or a relationship the text does not support. ` +
        answersBlock,
    },
    {
      command: "grid",
      text:
        `Estimate power, interest, and stance for each person already in this decision, using the calibrated bands. ` +
        `Read all four answers below, not one. Leave a value out only when the text gives no signal at all. ` +
        answersBlock,
    },
    {
      command: "network",
      text:
        `Map every relationship and influence read the text supports across all four answers below, including who the operator reports to. ` +
        `Add an edge only for a relationship the text states or strongly implies, and set an influence level only when the text supports it. Leave influence unset where there is no signal, and never fabricate an edge or a level. ` +
        answersBlock,
    },
  ];
}

export function hasUsableRoom(rooms, getDecisions) {
  return (rooms || []).some((room) => {
    const decisions = getDecisions(room.id) || [];
    const hasActiveDecision = decisions.some((d) => d.status !== "archived");
    const hasPeople =
      (room.rosterIds || []).length > 0 ||
      decisions.some((d) => [...(d.participantIds || []), ...(d.externalIds || [])].length > 0);
    return hasActiveDecision && hasPeople;
  });
}

export function shouldAutoStartOnboarding({ pending, prompted, usableRoom }) {
  return Boolean(pending && !prompted && !usableRoom);
}

export const ONBOARDING_QUESTIONS = [
  {
    id: "decision",
    prompt: "What decision are you trying to get through, and what outcome do you want?",
  },
  {
    id: "people",
    prompt: "Who are the 2 to 4 people who most affect it? Add name, role, and where they stand if you know.",
  },
  {
    id: "relationships",
    prompt: "What relationships matter? Name reporting lines, who defers to whom, support, or friction. Say skip if none.",
  },
];

export const ONBOARDING_INTRO =
  "The Situation Room maps the people behind a decision and helps you plan how to move the room. I will ask three quick questions, then build your first map.";

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
  const clean = cleanAnswer(decisionAnswer, 1600);
  const title = cleanAnswer(nameOverride, TITLE_MAX) || deriveDecisionTitle(decisionAnswer);
  return {
    roomName: title,
    title,
    context: {
      deciding: clean,
      goal: clean,
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

export function buildOnboardingCommandPlan(answers) {
  const decision = cleanAnswer(answers.decision, 1600);
  const people = cleanAnswer(answers.people, 1600);
  const relationships = cleanAnswer(answers.relationships, 1600);
  const plan = [
    {
      command: "create",
      text:
        `Create one person for each distinct individual named or described below. ` +
        `Use the person's name when it is given. When only a role is given, for example "the head of engineering", use that role as the name and set it as the role. ` +
        `Do not list the same person twice, and do not create a separate role-person for someone who is already named with that role. ` +
        `Decision and desired outcome: ${decision}. People: ${people}.`,
    },
    {
      command: "grid",
      text:
        `Estimate initial power, interest, and stance for each person already in this decision, using the calibrated bands. ` +
        `Map plain language to bands and leave a value out only when the text gives no signal at all. ` +
        `Decision and desired outcome: ${decision}. People notes: ${people}.`,
    },
  ];
  if (!relationshipAnswerIsEmpty(relationships)) {
    plan.push({
      command: "network",
      text: `Map only the stated relationships. Decision: ${decision}. Relationships: ${relationships}.`,
    });
  }
  return plan;
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

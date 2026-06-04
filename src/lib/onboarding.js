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

export function deriveDecisionSeed(decisionAnswer) {
  const clean = cleanAnswer(decisionAnswer, 1600);
  const title = clipSentence(clean, 86) || "First decision";
  return {
    roomName: `${title} room`,
    title,
    context: {
      deciding: clean,
      goal: clean,
      constraint: "",
    },
  };
}

export function buildOnboardingCommandPlan(answers) {
  const decision = cleanAnswer(answers.decision, 1600);
  const people = cleanAnswer(answers.people, 1600);
  const relationships = cleanAnswer(answers.relationships, 1600);
  const plan = [
    {
      command: "create",
      text: `Create these people for this decision. Decision and desired outcome: ${decision}. People: ${people}.`,
    },
    {
      command: "grid",
      text: `Estimate initial power, interest, and stance for each person using calibrated bands. Decision and desired outcome: ${decision}. People notes: ${people}.`,
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

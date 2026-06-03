/**
 * The reasoning engine for the chat.
 *
 * For the prototype this returns a pre written, grounded play when the question
 * matches the seeded scenario, and a graceful fallback otherwise.
 *
 * TODO: replace getResponse with a call to the Claude API. Pass the question,
 * the decision context (deciding, goal, constraint), the participants with
 * their framework reads, and per person notes. Return the same shape so nothing
 * downstream changes: { kind, headline, steps, sequence, risk, reasoning }.
 */

const SCENARIO_KEYWORDS = [
  "kill",
  "sunset",
  "legacy",
  "integration",
  "salesforce",
  "deprecate",
  "thursday",
  "leadership",
  "approve",
  "approved",
  "migration",
];

const CANNED_PLAY = {
  kind: "play",
  headline:
    "This is not a feature call. It is a status and surprise problem. You win it before Thursday, not in the room.",
  steps: [
    {
      n: 1,
      person: "lin",
      framework: "Fisher & Ury: interest",
      text:
        "Lin first. Bring her a clean migration timeline and she flips from soft resistance to the voice that tells the accounts they will be fine, which defuses Dana's strongest weapon before Dana can fire it.",
    },
    {
      n: 2,
      person: "raj",
      framework: "Cialdini: consistency",
      text:
        "Raj second, before Dana reaches him. Frame it strictly as tech debt and the platform direction you already agreed. A quiet 'I am fine with it' neutralizes the veto.",
    },
    {
      n: 3,
      person: "dana",
      framework: "SCARF: status",
      text:
        "Dana third, and never by surprise. Give her a face saving trade: she carries the migration story to her three accounts as the one protecting them. She moves when the story lets her save face.",
    },
    {
      n: 4,
      person: "priya",
      framework: "Cialdini: social proof",
      text:
        "Walk into the review with Lin, Raj, and Dana already aligned. Priya ratifies consensus and the meeting becomes the formality she wants.",
    },
  ],
  sequence: ["lin", "raj", "dana", "priya"],
  risk: {
    text:
      "Dana reaching Raj before you do and reframing this as product putting revenue at risk. His Certainty and Autonomy instinct then sides with stability and the veto is gone.",
    signal:
      "Early signal: if Raj starts asking about churn numbers instead of maintenance cost, Dana got there first and you are on defense.",
  },
  reasoning: [
    {
      title: "The real dynamic",
      body:
        "This is not a feature decision, it is a status and surprise problem. The substance is already on your side. Engineering is right that it is a maintenance drain. You lose this only one way: it turns into sales versus engineering in front of the CEO. Priya decides on perceived consensus under SCARF Fairness and Certainty, so a visible fight means the decision gets deferred and you lose. Your whole job is to walk into Thursday with the fight already resolved.",
    },
    {
      title: "The key players",
      body:
        "Raj holds the real veto but is currently checked out under Thomas-Kilmann avoiding. He becomes your obstacle only if Dana reaches him first and reframes this as revenue risk. Get to him early with the maintenance numbers using Cialdini authority and lock him as quiet support.\n\nDana is the loud blocker, but her real interest is not the accounts. It is not looking like her bet failed, which is SCARF status. She is a competing type, so routing around her backfires.\n\nLin is your cheapest, highest value convert. One clear migration path turns her from soft resistance into your spokesperson to the accounts.",
    },
    {
      title: "The play",
      body:
        "1. Lin first. Bring her a clean migration timeline. Win her quietly and she becomes the one who says the accounts will be fine, which defuses Dana's strongest weapon before Dana can fire it.\n\n2. Raj second, before Dana gets to him. Frame strictly as tech debt and platform direction, using Cialdini consistency. Get a quiet 'I am fine with it.' Now the veto is neutralized.\n\n3. Dana third, and never surprise her. Give her a face saving trade, since her interest is status, not the feature. The migration becomes a story she delivers to her three accounts, positioning her as the one who protected them. She moves when the story lets her save face.\n\n4. Walk into the review with Lin, Raj, and Dana already aligned. Priya ratifies consensus under Cialdini social proof. The meeting becomes a formality, which is what she wants.",
    },
    {
      title: "The risk",
      body:
        "Dana reaching Raj before you do. If she frames it as product putting revenue at risk while he is still disengaged, his Certainty and Autonomy instinct sides with stability and you have lost the veto. The signal to watch: if Raj starts asking about churn numbers instead of maintenance cost, Dana got there first and you are playing defense.",
    },
  ],
};

const FALLBACK = {
  kind: "fallback",
  body:
    "This prototype runs one seeded scenario. Try asking how to get the legacy integration sunset through the leadership review.",
};

function firstName(person) {
  return (person?.name || "").split(" ")[0].toLowerCase();
}

function matchingId(seedId, participants) {
  const wanted = seedId.toLowerCase();
  const match = participants.find((p) => {
    const id = (p.id || "").toLowerCase();
    return id === wanted || id.endsWith(`_${wanted}`) || firstName(p) === wanted;
  });
  return match?.id || seedId;
}

function scopedPlay(play, participants) {
  return {
    ...play,
    steps: play.steps.map((step) => ({ ...step, person: matchingId(step.person, participants) })),
    sequence: play.sequence.map((id) => matchingId(id, participants)),
  };
}

/**
 * @param {string} question
 * @param {import("../types/models").Person[]} participants
 * @param {Object} [context]  Decision context. Reserved for the live engine.
 * @returns {Object}
 */
export function getResponse(question, participants, context) {
  // TODO: send question, context, participants, and notes to the Claude API.
  const q = (question || "").toLowerCase();
  const matched = SCENARIO_KEYWORDS.some((kw) => q.includes(kw));
  return matched ? scopedPlay(CANNED_PLAY, participants || []) : FALLBACK;
}

export const EXAMPLE_PROMPTS = [
  "@network who moves whom",
  "@energy power and interest",
  "@note Chad protects PMs",
];

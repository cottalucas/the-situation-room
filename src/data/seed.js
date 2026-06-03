/**
 * Seed data for the prototype.
 *
 * This is the single source of mock data. The store reads from here on init.
 * When Firestore lands, this file becomes a one time seed script and the store
 * reads from collections instead.
 */

export const company = "Northwind";

/* ------------------------------------------------------------------ */
/* PEOPLE: global profiles                                             */
/* ------------------------------------------------------------------ */

export const peopleBase = [
  {
    id: "dana",
    name: "Dana Olsson",
    role: "VP of Sales",
    power: 78,
    interest: 92,
    goal: "Not be the one whose initiative got killed. Protect her standing with the CEO and her three accounts.",
    context:
      "Championed building this integration two years ago. Three of her biggest accounts use it. Reads any sunset as a hit to her credibility.",
    scarfDimensions: ["Status"],
    tkiStyle: "Competing",
    cialdiniLever: "Reciprocity · Status",
    fuTeaser: "Says accounts get hurt. Wants to not look like the one who lost.",
    scarf:
      "Status. She built this, so killing it publicly reads as 'your bet failed.' The threat is not the feature, it is how it makes her look to the CEO and her accounts.",
    tki:
      "Competing. She fights in the open and she is loud. Do not route around her quietly. She will notice the omission and escalate it harder than the decision itself.",
    cialdini:
      "Reciprocity and status preservation. Give her a win to trade: a migration story she can take to her three accounts that makes her the one protecting them. She moves if the narrative lets her save face.",
    fisherUry:
      "Stated position: this will hurt our enterprise accounts. Actual interest: not being the person whose initiative got killed, and not getting blindsided in front of clients.",
  },
  {
    id: "raj",
    name: "Raj Mehta",
    role: "CTO",
    power: 90,
    interest: 35,
    goal: "Keep engineering focused and out of a political fight he did not pick.",
    context:
      "Holds the real veto. Currently disengaged from this decision. Sees it as a product call, not an architecture crisis. Cares about engineering leverage and not relitigating settled things.",
    scarfDimensions: ["Certainty", "Autonomy"],
    tkiStyle: "Avoiding",
    cialdiniLever: "Authority · Consistency",
    fuTeaser: "Says nothing yet. Wants to not be the tiebreaker.",
    scarf:
      "Certainty and Autonomy. He resists anything that looks like product dragging engineering into a political fight. Frame it as reducing maintenance load and he leans in. Frame it as a sales versus product turf war and he checks out or sides with stability.",
    tki:
      "Avoiding on this topic. He will not spend capital unless forced. That is good for you if you pre frame it as tech debt, bad if Dana reaches him first and makes it about risk to revenue.",
    cialdini:
      "Authority and Consistency. He responds to data and to 'this is consistent with the platform direction we already agreed.' Bring the maintenance cost numbers, not the emotional case.",
    fisherUry:
      "Stated position: none yet. Actual interest: keep engineering focused, avoid being the tiebreaker in someone else's political fight.",
  },
  {
    id: "lin",
    name: "Lin Park",
    role: "Head of Customer Success",
    power: 55,
    interest: 88,
    goal: "Avoid being blamed for churn. Have a migration script she can deliver with confidence.",
    context:
      "Owns the relationship with the three accounts that still use the integration. Worried about churn and about being the one who has to deliver bad news.",
    scarfDimensions: ["Certainty"],
    tkiStyle: "Accommodating",
    cialdiniLever: "Reciprocity",
    fuTeaser: "Says accounts will be upset. Wants a script she can deliver confidently.",
    scarf:
      "Certainty. Her fear is a messy migration she cannot explain to customers. Give her a clear migration path and timeline and most of her resistance evaporates.",
    tki:
      "Accommodating. She will not fight you head on. She raises concerns quietly that others amplify. Win her early and she becomes the person who sells the change to the accounts for you.",
    cialdini:
      "Reciprocity. Hand her a customer ready migration narrative and she owes you one. She is the cheapest ally to convert into your strongest one.",
    fisherUry:
      "Stated position: the accounts will be upset. Actual interest: not being blamed for churn, having a script she can deliver with confidence.",
  },
  {
    id: "marco",
    name: "Marco Bianchi",
    role: "Eng Lead, Platform",
    power: 40,
    interest: 95,
    goal: "Get his team's time back from the maintenance drain.",
    context:
      "The one pushing hardest to kill it. The integration is his team's biggest maintenance drain. Right on substance, low on political weight.",
    scarfDimensions: [],
    tkiStyle: "Collaborating",
    cialdiniLever: "Authority source",
    fuTeaser: "Says kill it, it is a drain. Wants his team's time back. Aligned.",
    scarf:
      "He is your ally, so SCARF is not the lever here. Just make sure his enthusiasm does not frame this as engineering versus sales. That framing loses you Raj and hardens Dana.",
    tki:
      "Collaborating, but impatient. Keep him in the room for credibility, keep him off the messaging. Let product and CS carry the narrative so it does not read as an engineering land grab.",
    cialdini:
      "Already sold. Use him as your authority source on the maintenance cost, not as a spokesperson.",
    fisherUry:
      "Stated position: kill it, it is a drain. Actual interest: his team's time back. Aligned with you, so manage the optics, not the person.",
  },
  {
    id: "priya",
    name: "Priya Nair",
    role: "CEO",
    power: 95,
    interest: 30,
    goal: "A clean, consensus looking decision she does not have to adjudicate.",
    context:
      "Will ratify whatever the room converges on, but hates surprises and hates watching her execs fight in front of her. Decides on perceived consensus and clean reasoning.",
    scarfDimensions: ["Fairness", "Certainty"],
    tkiStyle: "Avoiding",
    cialdiniLever: "Social proof",
    fuTeaser: "Says unknown. Wants to not referee a fight.",
    scarf:
      "Fairness and Certainty. She sides against whoever makes the meeting messy. Walk in with alignment already built and she rubber stamps it. Walk in with an open Dana versus Marco fight and she defers the decision, which is a loss for you.",
    tki:
      "Avoiding conflict in the room. Her real decision happens based on what is pre wired before Thursday, not in the meeting.",
    cialdini:
      "Social proof and consensus. 'Sales, CS, and Eng have aligned on a migration plan' is the sentence that wins. Manufacture that sentence before the meeting.",
    fisherUry:
      "Stated position: unknown. Actual interest: a clean, consensus looking decision she does not have to adjudicate.",
  },
  {
    id: "chad",
    name: "Chad Rivera",
    role: "Head of Product",
    power: 68,
    interest: 72,
    goal: "Back his team while still looking decisive to the CEO.",
    context:
      "Your manager. Generally backs the team, but needs to look decisive in front of Priya before he commits publicly.",
    scarfDimensions: ["Status", "Certainty"],
    tkiStyle: "Compromising",
    cialdiniLever: "Authority · Consensus",
    fuTeaser: "Says let's see where it lands. Wants to not be caught out by the CEO.",
    scarf:
      "Status and Certainty. He will not get ahead of the CEO. Give him a position that is already defensible upward and he carries it.",
    tki:
      "Compromising. He looks for the deal everyone can live with. Useful as a closer, risky if you need someone to hold a hard line.",
    cialdini:
      "Authority and consensus. He moves when it is clear leadership will not be surprised. Pre wire Priya's likely reaction for him.",
    fisherUry:
      "Stated position: let's see where the team lands. Actual interest: not being caught backing a call the CEO later second guesses.",
  },
];

/* ------------------------------------------------------------------ */
/* NETWORK: influence map. Positions are percent of canvas (0 to 100). */
/* ------------------------------------------------------------------ */

export const networkPositions = {
  priya: { x: 50, y: 14 },
  raj: { x: 80, y: 40 },
  dana: { x: 20, y: 40 },
  marco: { x: 72, y: 82 },
  lin: { x: 28, y: 82 },
  chad: { x: 50, y: 58 },
};

export const networkEdges = [
  { from: "priya", to: "raj", type: "defers", note: "Priya defers to Raj's veto" },
  { from: "raj", to: "marco", type: "defers", note: "Raj trusts Marco on the tech" },
  { from: "dana", to: "lin", type: "defers", note: "Dana leans on Lin's concerns" },
  { from: "dana", to: "marco", type: "conflict", note: "Sales versus Engineering" },
  { from: "lin", to: "marco", type: "ally", note: "Could co own the migration" },
  { from: "chad", to: "priya", type: "defers", note: "Chad pre wires Priya" },
];

export const EDGE_META = {
  ally: { label: "Ally", color: "var(--for)" },
  conflict: { label: "Conflict", color: "var(--against)" },
  defers: { label: "Defers to", color: "var(--ink-faint)" },
};

/* ------------------------------------------------------------------ */
/* HISTORY: global memory per person                                   */
/* ------------------------------------------------------------------ */

export const histories = {
  dana: [
    { decision: "Q3 pricing change", stance: "for", note: "Vocal champion. Drove it with her team." },
    { decision: "Vendor consolidation", stance: "against", note: "Resisted until given ownership of the rollout." },
    { decision: "Legacy Salesforce sunset", stance: "against", note: "Came around when given a face saving migration story." },
  ],
  raj: [
    { decision: "Microservices migration", stance: "for", note: "Drove it himself. High conviction on architecture." },
    { decision: "On call policy change", stance: "neutral", note: "Stayed out until shown the incident data." },
  ],
  lin: [
    { decision: "NPS program rollout", stance: "for", note: "Championed it. Owns the metric now." },
    { decision: "Support tooling switch", stance: "against", note: "Anxious about churn. Flipped once given a clear plan." },
  ],
  marco: [
    { decision: "Tech debt sprint", stance: "for", note: "Pushed hard, got it funded." },
    { decision: "Hiring freeze", stance: "against", note: "Frustrated and vocal about team capacity." },
  ],
  priya: [
    { decision: "Annual planning", stance: "neutral", note: "Ratified the consensus. Hates being the tiebreaker." },
    { decision: "Org reorg", stance: "neutral", note: "Deferred the call until the execs aligned first." },
  ],
  chad: [
    { decision: "Roadmap reprioritization", stance: "for", note: "Backed the team's call to leadership." },
    { decision: "Headcount request", stance: "neutral", note: "Wanted to look decisive to Priya before committing." },
  ],
};

/* ------------------------------------------------------------------ */
/* ROOMS and DECISIONS                                                 */
/* ------------------------------------------------------------------ */

export const seedRooms = [
  {
    id: "mobile",
    name: "Mobile app team",
    rosterIds: ["dana", "raj", "lin", "marco", "priya", "chad"],
  },
];

export const seedDecisions = [
  {
    id: "salesforce",
    roomId: "mobile",
    title: "Sunsetting legacy Salesforce",
    context: {
      deciding: "Sunset the legacy Salesforce integration",
      goal: "Cut maintenance load without losing the three enterprise accounts",
      constraint: "Decision at the leadership review",
    },
    deadline: "2026-06-04",
    status: "active",
    participantIds: ["dana", "raj", "lin", "marco", "priya"],
    externalIds: [],
    positions: { dana: "against", raj: "neutral", lin: "against", marco: "for", priya: "unknown" },
  },
  {
    id: "pricing",
    roomId: "mobile",
    title: "Q2 pricing change",
    context: {
      deciding: "Raise list pricing on the mid tier plan",
      goal: "Lift ARPA without spiking churn",
      constraint: "Shipped last quarter",
    },
    deadline: "",
    status: "archived",
    participantIds: ["dana", "marco", "raj", "lin", "priya"],
    externalIds: [],
    positions: { dana: "for", marco: "for", raj: "neutral", lin: "for", priya: "neutral" },
  },
  {
    id: "checkout",
    roomId: "mobile",
    title: "Checkout redesign",
    context: {
      deciding: "Rebuild the mobile checkout flow",
      goal: "Reduce drop off at payment",
      constraint: "Shipped two quarters ago",
    },
    deadline: "",
    status: "archived",
    participantIds: ["lin", "dana", "marco", "raj"],
    externalIds: [],
    positions: { lin: "for", dana: "neutral", marco: "for", raj: "for" },
  },
];

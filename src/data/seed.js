/**
 * Seed data for explicit local preview mode.
 *
 * Shapes match the Firestore schema in docs/architecture.md exactly:
 *   person  has stable traits (role, goal, context, baseRead, visualTags) and
 *           an observations list. power and interest are NOT on the person.
 *   decision holds the situational overlay: positions (People), placements
 *           (Grid power and interest, per decision), and edges (Network).
 */

/* Base power and interest used only to seed decision placements. */
const BASE_PI = {
  self: { power: 42, interest: 95 },
  dana: { power: 78, interest: 92 },
  raj: { power: 90, interest: 35 },
  lin: { power: 55, interest: 88 },
  marco: { power: 40, interest: 95 },
  priya: { power: 95, interest: 30 },
  chad: { power: 68, interest: 72 },
};

function placementsFor(ids) {
  const out = {};
  ids.forEach((id) => (out[id] = { ...(BASE_PI[id] || { power: 50, interest: 55 }) }));
  return out;
}

/* ------------------------------------------------------------------ */
/* PEOPLE: global profiles                                             */
/* ------------------------------------------------------------------ */

export const peopleBase = [
  {
    id: "self",
    name: "You",
    role: "Product Manager",
    isSelf: true,
    goal: "Get the legacy Salesforce integration sunset through the leadership review.",
    context: "The operator working this decision. Owns the play, but not the final call.",
    baseRead: { scarf: "", tki: "", cialdini: "", fisherUry: "" },
    visualTags: { scarfDimensions: [], tkiStyle: "", cialdiniLever: "", fuTeaser: "" },
    relationships: [],
  },
  {
    id: "dana",
    name: "Dana Olsson",
    role: "VP of Sales",
    goal: "Not be the one whose initiative got killed. Protect her standing with the CEO and her three accounts.",
    context:
      "Championed building this integration two years ago. Three of her biggest accounts use it. Reads any sunset as a hit to her credibility.",
    baseRead: {
      scarf:
        "Status. She built this, so killing it publicly reads as 'your bet failed.' The threat is not the feature, it is how it makes her look to the CEO and her accounts.",
      tki:
        "Competing. She fights in the open and she is loud. Do not route around her quietly. She will notice the omission and escalate it harder than the decision itself.",
      cialdini:
        "Reciprocity and status preservation. Give her a win to trade: a migration story she can take to her three accounts that makes her the one protecting them. She moves if the narrative lets her save face.",
      fisherUry:
        "Stated position: this will hurt our enterprise accounts. Actual interest: not being the person whose initiative got killed, and not getting blindsided in front of clients.",
    },
    visualTags: { scarfDimensions: ["Status"], tkiStyle: "Competing", cialdiniLever: "Reciprocity · Status", fuTeaser: "Says accounts get hurt. Wants to not look like the one who lost." },
    relationships: [{ personId: "marco", type: "conflict" }],
  },
  {
    id: "raj",
    name: "Raj Mehta",
    role: "CTO",
    goal: "Keep engineering focused and out of a political fight he did not pick.",
    context:
      "Holds the real veto. Currently disengaged from this decision. Sees it as a product call, not an architecture crisis. Cares about engineering leverage and not relitigating settled things.",
    baseRead: {
      scarf:
        "Certainty and Autonomy. He resists anything that looks like product dragging engineering into a political fight. Frame it as reducing maintenance load and he leans in. Frame it as a sales versus product turf war and he checks out or sides with stability.",
      tki:
        "Avoiding on this topic. He will not spend capital unless forced. That is good for you if you pre frame it as tech debt, bad if Dana reaches him first and makes it about risk to revenue.",
      cialdini:
        "Authority and Consistency. He responds to data and to 'this is consistent with the platform direction we already agreed.' Bring the maintenance cost numbers, not the emotional case.",
      fisherUry:
        "Stated position: none yet. Actual interest: keep engineering focused, avoid being the tiebreaker in someone else's political fight.",
    },
    visualTags: { scarfDimensions: ["Certainty", "Autonomy"], tkiStyle: "Avoiding", cialdiniLever: "Authority · Consistency", fuTeaser: "Says nothing yet. Wants to not be the tiebreaker." },
    relationships: [{ personId: "marco", type: "defers" }],
  },
  {
    id: "lin",
    name: "Lin Park",
    role: "Head of Customer Success",
    goal: "Avoid being blamed for churn. Have a migration script she can deliver with confidence.",
    context:
      "Owns the relationship with the three accounts that still use the integration. Worried about churn and about being the one who has to deliver bad news.",
    baseRead: {
      scarf:
        "Certainty. Her fear is a messy migration she cannot explain to customers. Give her a clear migration path and timeline and most of her resistance evaporates.",
      tki:
        "Accommodating. She will not fight you head on. She raises concerns quietly that others amplify. Win her early and she becomes the person who sells the change to the accounts for you.",
      cialdini:
        "Reciprocity. Hand her a customer ready migration narrative and she owes you one. She is the cheapest ally to convert into your strongest one.",
      fisherUry:
        "Stated position: the accounts will be upset. Actual interest: not being blamed for churn, having a script she can deliver with confidence.",
    },
    visualTags: { scarfDimensions: ["Certainty"], tkiStyle: "Accommodating", cialdiniLever: "Reciprocity", fuTeaser: "Says accounts will be upset. Wants a script she can deliver confidently." },
    relationships: [{ personId: "marco", type: "ally" }],
  },
  {
    id: "marco",
    name: "Marco Bianchi",
    role: "Eng Lead, Platform",
    goal: "Get his team's time back from the maintenance drain.",
    context:
      "The one pushing hardest to kill it. The integration is his team's biggest maintenance drain. Right on substance, low on political weight.",
    baseRead: {
      scarf:
        "He is your ally, so SCARF is not the lever here. Just make sure his enthusiasm does not frame this as engineering versus sales. That framing loses you Raj and hardens Dana.",
      tki:
        "Collaborating, but impatient. Keep him in the room for credibility, keep him off the messaging. Let product and CS carry the narrative so it does not read as an engineering land grab.",
      cialdini:
        "Already sold. Use him as your authority source on the maintenance cost, not as a spokesperson.",
      fisherUry:
        "Stated position: kill it, it is a drain. Actual interest: his team's time back. Aligned with you, so manage the optics, not the person.",
    },
    visualTags: { scarfDimensions: [], tkiStyle: "Collaborating", cialdiniLever: "Authority source", fuTeaser: "Says kill it, it is a drain. Wants his team's time back. Aligned." },
    relationships: [],
  },
  {
    id: "priya",
    name: "Priya Nair",
    role: "CEO",
    goal: "A clean, consensus looking decision she does not have to adjudicate.",
    context:
      "Will ratify whatever the room converges on, but hates surprises and hates watching her execs fight in front of her. Decides on perceived consensus and clean reasoning.",
    baseRead: {
      scarf:
        "Fairness and Certainty. She sides against whoever makes the meeting messy. Walk in with alignment already built and she rubber stamps it. Walk in with an open Dana versus Marco fight and she defers the decision, which is a loss for you.",
      tki:
        "Avoiding conflict in the room. Her real decision happens based on what is pre wired before Thursday, not in the meeting.",
      cialdini:
        "Social proof and consensus. 'Sales, CS, and Eng have aligned on a migration plan' is the sentence that wins. Manufacture that sentence before the meeting.",
      fisherUry:
        "Stated position: unknown. Actual interest: a clean, consensus looking decision she does not have to adjudicate.",
    },
    visualTags: { scarfDimensions: ["Fairness", "Certainty"], tkiStyle: "Avoiding", cialdiniLever: "Social proof", fuTeaser: "Says unknown. Wants to not referee a fight." },
    relationships: [{ personId: "raj", type: "defers" }],
  },
  {
    id: "chad",
    name: "Chad Rivera",
    role: "Head of Product",
    goal: "Back his team while still looking decisive to the CEO.",
    context:
      "Your manager. Generally backs the team, but needs to look decisive in front of Priya before he commits publicly.",
    baseRead: {
      scarf:
        "Status and Certainty. He will not get ahead of the CEO. Give him a position that is already defensible upward and he carries it.",
      tki:
        "Compromising. He looks for the deal everyone can live with. Useful as a closer, risky if you need someone to hold a hard line.",
      cialdini:
        "Authority and consensus. He moves when it is clear leadership will not be surprised. Pre wire Priya's likely reaction for him.",
      fisherUry:
        "Stated position: let's see where the team lands. Actual interest: not being caught backing a call the CEO later second guesses.",
    },
    visualTags: { scarfDimensions: ["Status", "Certainty"], tkiStyle: "Compromising", cialdiniLever: "Authority · Consensus", fuTeaser: "Says let's see where it lands. Wants to not be caught out by the CEO." },
    relationships: [{ personId: "priya", type: "defers" }],
  },
];

/* Seed observations: the compounding person memory. */
export const seedObservations = {
  dana: [
    { text: "Q3 pricing change: vocal champion, drove it with her team.", source: "history" },
    { text: "Vendor consolidation: resisted until given ownership of the rollout.", source: "history" },
    { text: "Legacy Salesforce sunset: came around when given a face saving migration story.", source: "history" },
  ],
  raj: [
    { text: "Microservices migration: drove it himself, high conviction on architecture.", source: "history" },
    { text: "On call policy change: stayed out until shown the incident data.", source: "history" },
  ],
  lin: [
    { text: "NPS program rollout: championed it, owns the metric now.", source: "history" },
    { text: "Support tooling switch: anxious about churn, flipped once given a clear plan.", source: "history" },
  ],
  marco: [
    { text: "Tech debt sprint: pushed hard, got it funded.", source: "history" },
    { text: "Hiring freeze: frustrated and vocal about team capacity.", source: "history" },
    { text: "Says the Salesforce integration burns platform time every week.", source: "note", decisionId: "salesforce" },
    { text: "Wants the maintenance graph in front of Raj, not a sales debate.", source: "note", decisionId: "salesforce" },
    { text: "Flagged that the sync failures mostly hit accounts with old custom fields.", source: "note", decisionId: "salesforce" },
    { text: "Keeps asking for a clear sunset date so his team can stop context switching.", source: "note", decisionId: "salesforce" },
    { text: "Worries Dana will turn the conversation into engineering not supporting revenue.", source: "note", decisionId: "salesforce" },
    { text: "Has the maintenance cost numbers ready but should not lead the executive story.", source: "note", decisionId: "salesforce" },
    { text: "Thinks Lin can sell the migration if she gets a customer-safe script.", source: "note", decisionId: "salesforce" },
    { text: "Says two engineers lose most Fridays to reactive Salesforce cleanup.", source: "note", decisionId: "salesforce" },
    { text: "Prefers a clean kill date over another quarter of partial support.", source: "note", decisionId: "salesforce" },
    { text: "Can explain the technical risk in one page, but tends to sound impatient live.", source: "note", decisionId: "salesforce" },
    { text: "Believes Raj will support the call if the ask is framed as platform focus.", source: "note", decisionId: "salesforce" },
    { text: "Has no issue helping Dana's accounts migrate if the timeline is firm.", source: "note", decisionId: "salesforce" },
    { text: "Says the custom workaround list is now longer than the actual integration code.", source: "note", decisionId: "salesforce" },
    { text: "Needs product to own the customer narrative so this does not look like engineering cutting scope.", source: "note", decisionId: "salesforce" },
    { text: "Would accept one named exception account if the broader sunset stays intact.", source: "note", decisionId: "salesforce" },
  ],
  priya: [
    { text: "Annual planning: ratified the consensus, hates being the tiebreaker.", source: "history" },
    { text: "Org reorg: deferred the call until the execs aligned first.", source: "history" },
  ],
  chad: [
    { text: "Roadmap reprioritization: backed the team's call to leadership.", source: "history" },
    { text: "Headcount request: wanted to look decisive to Priya before committing.", source: "history" },
  ],
};

/* ------------------------------------------------------------------ */
/* NETWORK: node layout (percent of canvas) and edge styling          */
/* ------------------------------------------------------------------ */

export const networkPositions = {
  self: { x: 50, y: 90 },
  priya: { x: 50, y: 14 },
  raj: { x: 80, y: 40 },
  dana: { x: 20, y: 40 },
  marco: { x: 72, y: 82 },
  lin: { x: 28, y: 82 },
  chad: { x: 50, y: 58 },
};

export const EDGE_META = {
  ally: { label: "Ally", color: "var(--for)" },
  conflict: { label: "Conflict", color: "var(--against)" },
  defers: { label: "Defers to", color: "var(--ink-faint)" },
};

const SALESFORCE_EDGES = [
  { from: "priya", to: "raj", type: "defers" },
  { from: "raj", to: "marco", type: "defers" },
  { from: "dana", to: "lin", type: "defers" },
  { from: "dana", to: "marco", type: "conflict" },
  { from: "lin", to: "marco", type: "ally" },
  { from: "chad", to: "priya", type: "defers" },
];

/* ------------------------------------------------------------------ */
/* ROOMS and DECISIONS                                                 */
/* ------------------------------------------------------------------ */

export const seedRooms = [
  { id: "mobile", name: "Mobile app team", rosterIds: ["self", "dana", "raj", "lin", "marco", "priya", "chad"] },
];

export const seedDecisions = [
  {
    id: "salesforce",
    roomId: "mobile",
    title: "Sunsetting legacy Salesforce",
    context: {
      deciding: "Sunset the legacy Salesforce integration",
      goal: "Cut maintenance load without losing the 3 enterprise accounts",
      constraint: "Decision at the leadership review",
    },
    decisionNotes: [],
    derivedSummary: "",
    deadline: "2026-06-04",
    status: "active",
    participantIds: ["self", "dana", "raj", "lin", "marco", "priya"],
    externalIds: [],
    positions: { self: "for", dana: "against", raj: "neutral", lin: "against", marco: "for", priya: "unknown" },
    placements: placementsFor(["self", "dana", "raj", "lin", "marco", "priya"]),
    edges: SALESFORCE_EDGES,
  },
  {
    id: "pricing",
    roomId: "mobile",
    title: "Q2 pricing change",
    context: { deciding: "Raise list pricing on the mid tier plan", goal: "Lift ARPA without spiking churn", constraint: "Shipped last quarter" },
    decisionNotes: [],
    derivedSummary: "",
    deadline: "",
    status: "archived",
    participantIds: ["dana", "marco", "raj", "lin", "priya"],
    externalIds: [],
    positions: { dana: "for", marco: "for", raj: "neutral", lin: "for", priya: "neutral" },
    placements: placementsFor(["dana", "marco", "raj", "lin", "priya"]),
    edges: [],
  },
  {
    id: "checkout",
    roomId: "mobile",
    title: "Checkout redesign",
    context: { deciding: "Rebuild the mobile checkout flow", goal: "Reduce drop off at payment", constraint: "Shipped two quarters ago" },
    decisionNotes: [],
    derivedSummary: "",
    deadline: "",
    status: "archived",
    participantIds: ["lin", "dana", "marco", "raj"],
    externalIds: [],
    positions: { lin: "for", dana: "neutral", marco: "for", raj: "for" },
    placements: placementsFor(["lin", "dana", "marco", "raj"]),
    edges: [],
  },
];

export const DEFAULT_PLACEMENT = { power: 50, interest: 55 };

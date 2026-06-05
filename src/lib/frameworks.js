/**
 * Framework and quadrant helpers. Pure functions and constants, no state.
 */

export const QUADRANTS = {
  highPowerHighInterest: { label: "Manage closely", key: "manage", accent: "#B91C1C" },
  highPowerLowInterest: { label: "Keep satisfied", key: "satisfied", accent: "#B45309" },
  lowPowerHighInterest: { label: "Keep informed", key: "informed", accent: "#0F6E56" },
  lowPowerLowInterest: { label: "Monitor", key: "monitor", accent: "#5F5E5A" },
};

export function quadrantFor(power, interest) {
  const hiPower = power >= 50;
  const hiInterest = interest >= 50;
  if (hiPower && hiInterest) return QUADRANTS.highPowerHighInterest;
  if (hiPower && !hiInterest) return QUADRANTS.highPowerLowInterest;
  if (!hiPower && hiInterest) return QUADRANTS.lowPowerHighInterest;
  return QUADRANTS.lowPowerLowInterest;
}

export function initialsOf(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function shortNameOf(name) {
  const first = String(name || "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-z0-9]/gi, "");
  if (!first) return "?";
  return `${first[0].toUpperCase()}${first.slice(1, 3).toLowerCase()}`;
}

export const POSITION_META = {
  for: { label: "For", cls: "pos-for" },
  against: { label: "Against", cls: "pos-against" },
  neutral: { label: "Neutral", cls: "pos-neutral" },
  unknown: { label: "Position unknown", cls: "pos-unknown" },
};

/* SCARF dimensions and their colors. */
export const SCARF_ALL = ["Status", "Certainty", "Autonomy", "Relatedness", "Fairness"];
export const SCARF_COLORS = {
  Status: "#B91C1C",
  Certainty: "#B45309",
  Autonomy: "#0F6E56",
  Relatedness: "#1D4ED8",
  Fairness: "#7C3AED",
};

/* Thomas Kilmann modes and their colors. */
export const TKI_COLORS = {
  Competing: "#B91C1C",
  Avoiding: "#8d8a82",
  Compromising: "#B45309",
  Collaborating: "#0F6E56",
  Accommodating: "#1D4ED8",
};

/* Framework names that get highlighted inline in play text. */
const FW_NAMES = ["SCARF", "Thomas-Kilmann", "Cialdini", "Fisher & Ury"];
export const FW_SET = new Set(FW_NAMES);
export const FW_SPLIT_RE = /(SCARF|Thomas-Kilmann|Cialdini|Fisher & Ury)/;

/**
 * Compact state-label chips for a person, derived from their mapped visual tags.
 * These are ENTRY POINTS, not content: each chip names the mapped state only
 * (SCARF dimensions, Thomas-Kilmann mode, Cialdini levers, Fisher & Ury teaser).
 * No tooltip, no popover. The only explainer route is the shared /frameworks
 * page. Returns the mapped frameworks only; an unmapped person yields [].
 */
export function frameworkChips(person) {
  const tags = person?.visualTags || {};
  const dims = tags.scarfDimensions || [];
  const levers = (tags.cialdiniLever || "").split("·").map((l) => l.trim()).filter(Boolean);
  const chips = [];
  if (dims.length) {
    chips.push({ key: "scarf", framework: "SCARF", label: dims.join(", "), accent: SCARF_COLORS[dims[0]] || "var(--ink-faint)" });
  }
  if (tags.tkiStyle) {
    chips.push({ key: "tki", framework: "Thomas-Kilmann", label: tags.tkiStyle, accent: TKI_COLORS[tags.tkiStyle] || "var(--ink-faint)" });
  }
  if (levers.length) {
    chips.push({ key: "cialdini", framework: "Cialdini", label: levers.join(", "), accent: "var(--ink-soft)" });
  }
  if (tags.fuTeaser) {
    chips.push({ key: "fisherUry", framework: "Fisher & Ury", label: tags.fuTeaser, accent: "var(--ink-soft)" });
  }
  return chips;
}

/** The single SCARF state label for a node summary, or empty when unmapped. */
export function scarfStateLabel(person) {
  const dims = person?.visualTags?.scarfDimensions || [];
  return dims.length ? dims.join(", ") : "";
}

/**
 * Generic, person-independent framework reference for the Tier 3 /frameworks
 * page. What each lens is, what its states mean, and how to read it on a person.
 * No person data ever lives here. Plain content, one section per framework.
 */
export const FRAMEWORK_REFERENCE = [
  {
    key: "scarf",
    name: "SCARF",
    tagline: "What feels threatened or rewarded in a social situation.",
    what: "SCARF is David Rock's model of the social drivers that move people toward or away from a decision. It reads observable reactions, not personality.",
    states: [
      ["Status", "Their sense of standing relative to others. Threatened by being overruled or corrected in public."],
      ["Certainty", "Their ability to predict what happens next. Threatened by ambiguity and sudden change."],
      ["Autonomy", "Their sense of control and choice. Threatened by being told what to do with no options."],
      ["Relatedness", "Their sense of trust and belonging. Threatened by feeling like an outsider to the group."],
      ["Fairness", "Their read on whether the process is even-handed. Threatened by hidden deals or uneven rules."],
    ],
    read: "Tagged dimensions are the levers most likely to be in play for that person. Protect the threatened one and you lower resistance before you make the ask.",
  },
  {
    key: "tki",
    name: "Thomas-Kilmann",
    tagline: "How someone tends to handle conflict.",
    what: "The Thomas-Kilmann instrument maps conflict behavior across two axes, assertiveness and cooperativeness, into five modes. It describes a tendency in this situation, not a fixed type.",
    states: [
      ["Competing", "Assertive and uncooperative. Pushes for their position. Come with leverage, not only rapport."],
      ["Collaborating", "Assertive and cooperative. Looks for a joint win. Bring them in to shape the solution."],
      ["Compromising", "Middle ground. Meets halfway. Open with room to trade."],
      ["Avoiding", "Unassertive and uncooperative. Sidesteps conflict. Lower the stakes and make agreeing easy."],
      ["Accommodating", "Unassertive and cooperative. Tends to yield. Confirm real agreement, not just deference."],
    ],
    read: "The mapped mode tells you the pressure and pace to use. Match it and the conversation moves; ignore it and you push on the wrong lever.",
  },
  {
    key: "cialdini",
    name: "Cialdini",
    tagline: "Which influence lever is most likely to land.",
    what: "Robert Cialdini's principles of persuasion name the levers that shift a yes or no. The mapped levers are the ones this person responds to in observed behavior.",
    states: [
      ["Reciprocity", "They return favors. Offer something useful first."],
      ["Commitment and consistency", "They stay true to prior positions. Link the ask to a commitment they already made."],
      ["Social proof", "They follow aligned peers. Show who else is on board."],
      ["Authority", "They defer to credible expertise. Bring proof or a respected source."],
      ["Liking", "They say yes to people they trust. Use a trusted messenger."],
      ["Scarcity", "They act on what is limited. Make the cost of waiting concrete."],
    ],
    read: "Lead with the mapped lever and the same ask reaches them more cleanly. Use a lever they do not respond to and the message bounces.",
  },
  {
    key: "fisherUry",
    name: "Fisher & Ury",
    tagline: "The interest underneath the stated position.",
    what: "From Getting to Yes, this lens separates the position someone states from the interest that drives it. Solve the interest and the position usually softens.",
    states: [
      ["Position", "What they say they want, the stated ask on the table."],
      ["Interest", "Why they want it, the underlying need behind the ask."],
      ["BATNA", "Their best alternative if there is no deal, which sets their walk-away point."],
    ],
    read: "The teaser names the real interest to work from. Trade on the interest, not the stated position, and you find room that a head-to-head on positions hides.",
  },
];

/* Format an ISO date string for display. Empty stays empty. */
export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

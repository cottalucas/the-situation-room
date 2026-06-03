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

/* Format an ISO date string for display. Empty stays empty. */
export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

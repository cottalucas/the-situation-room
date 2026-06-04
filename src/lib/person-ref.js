/**
 * Pure person-reference resolution. Extracted from Room.jsx so the anaphora,
 * title, role, and typo handling is unit-testable without React or the store.
 *
 * Given a raw reference (an id, a name, a first name, a role, a title, or a near
 * miss with a typo) and ordered candidate pools, it returns the single matching
 * person or null. Returning null for an ambiguous or unknown reference is what
 * keeps the command path from creating a duplicate person when the user means an
 * existing one. People should be reachable the way a colleague would name them:
 * "Chad", "the CEO", "head of sales", "the person in charge", even "Roven".
 */

export function firstName(name) {
  return String(name || "").split(/\s+/)[0]?.toLowerCase() || "";
}

export function normalizeRef(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|a|an|our|my|their)\s+/, "")
    .trim();
}

// Long role phrase <-> common abbreviation, matched both directions.
const ROLE_ABBR = [
  { re: /chief executive( officer)?/, abbr: "ceo", long: "chief executive officer" },
  { re: /chief product( officer)?/, abbr: "cpo", long: "chief product officer" },
  { re: /chief technology( officer)?|chief technical( officer)?/, abbr: "cto", long: "chief technology officer" },
  { re: /chief financial( officer)?/, abbr: "cfo", long: "chief financial officer" },
  { re: /chief operating( officer)?/, abbr: "coo", long: "chief operating officer" },
  { re: /chief marketing( officer)?/, abbr: "cmo", long: "chief marketing officer" },
  { re: /chief information( officer)?/, abbr: "cio", long: "chief information officer" },
  { re: /vice president/, abbr: "vp", long: "vice president" },
  { re: /product manager/, abbr: "pm", long: "product manager" },
];

// Generic "the person running things" references resolve to a single top leader.
const LEADER_TERMS = new Set([
  "boss",
  "the boss",
  "person in charge",
  "in charge",
  "leader",
  "head honcho",
  "top dog",
  "chief",
  "decision maker",
  "head of the company",
  "person running the company",
  "person in charge of the company",
]);
const LEADER_ROLE = /\bceo\b|chief executive|founder|president|owner|managing director/;

export function roleAliases(role) {
  const clean = normalizeRef(role);
  const set = new Set([clean]);
  ROLE_ABBR.forEach(({ re, abbr, long }) => {
    if (re.test(clean) || clean === abbr || clean === long) {
      set.add(abbr);
      set.add(long);
    }
  });
  // "head of sales" should also answer to "sales", "head of product" to "product".
  const headOf = clean.match(/head of (.+)/) || clean.match(/lead of (.+)/);
  if (headOf) set.add(headOf[1]);
  set.delete("");
  return set;
}

function findUniquePerson(list, predicate) {
  const matches = (list || []).filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

// Small Levenshtein for conservative typo tolerance on names.
function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j += 1) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i += 1) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

function typoMatch(token, value) {
  const v = normalizeRef(value);
  if (!v || token.length < 4) return false;
  const allow = token.length >= 6 ? 2 : 1;
  return editDistance(token, v) <= allow;
}

/**
 * @param {string} ref           raw reference from model output or user text
 * @param {Array<Array>} pools   ordered candidate pools, e.g. [participants, allPeople]
 * @returns {Object|null} the resolved person or null
 */
export function resolvePersonRef(ref, pools = [], { exactOnly = false } = {}) {
  const rawToken = String(ref || "").toLowerCase().trim();
  const token = normalizeRef(ref);
  if (!token) return null;
  for (const pool of pools) {
    // 1. exact id / name / first name
    const exact = findUniquePerson(
      pool,
      (p) =>
        p.id.toLowerCase() === rawToken ||
        normalizeRef(p.id) === token ||
        normalizeRef(p.name) === token ||
        firstName(p.name) === token
    );
    if (exact) return exact;

    // 2. role or title alias (exact)
    const roleExact = findUniquePerson(pool, (p) => roleAliases(p.role).has(token));
    if (roleExact) return roleExact;

    // 3. generic "the person in charge" -> the single top leader
    if (LEADER_TERMS.has(token) || LEADER_TERMS.has(rawToken)) {
      const leader = findUniquePerson(pool, (p) => LEADER_ROLE.test(normalizeRef(p.role)));
      if (leader) return leader;
    }

    if (exactOnly) continue;

    // 4. role substring (e.g. "sales" inside "head of sales")
    const roleFuzzy = findUniquePerson(pool, (p) => {
      const role = normalizeRef(p.role);
      return token.length >= 4 && role && (role.includes(token) || token.includes(role) || [...roleAliases(p.role)].some((a) => a.includes(token) || token.includes(a)));
    });
    if (roleFuzzy) return roleFuzzy;

    // 5. typo tolerance on name / first name (conservative, unique only)
    const fuzzyName = findUniquePerson(pool, (p) => typoMatch(token, firstName(p.name)) || typoMatch(token, p.name));
    if (fuzzyName) return fuzzyName;
  }
  return null;
}

/**
 * Split a string like "head of sales is constantly asking for updates" into the
 * leading person reference and the rest. Tries the longest leading phrase that
 * resolves to a unique person, so titles and multi-word names work for @note.
 * Falls back to the first word as the ref when nothing resolves.
 *
 * @returns {{ person: Object|null, body: string, ref: string }}
 */
export function splitLeadingPersonRef(text, pools = []) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { person: null, body: "", ref: "" };
  const maxPrefix = Math.min(6, words.length - 1);
  for (let n = maxPrefix; n >= 1; n -= 1) {
    const ref = words.slice(0, n).join(" ");
    // Exact only: a sentence body must not be greedily swallowed by a substring
    // role match (e.g. "head of sales is constantly" should not match a role).
    const person = resolvePersonRef(ref, pools, { exactOnly: true });
    if (person) return { person, body: words.slice(n).join(" ").trim(), ref };
  }
  return { person: null, body: words.slice(1).join(" ").trim(), ref: words[0] };
}

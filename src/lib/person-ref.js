/**
 * Pure person-reference resolution. Extracted from Room.jsx so the anaphora and
 * role-resolution behavior is unit-testable without React or the store. Given a
 * raw reference (an id, a name, a first name, or a role phrase) and ordered
 * candidate pools, it returns the single matching person or null. Returning null
 * for an ambiguous or unknown reference is what keeps the command path from
 * creating a duplicate person when the model means an existing one.
 */

export function firstName(name) {
  return String(name || "").split(/\s+/)[0]?.toLowerCase() || "";
}

export function normalizeRef(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .trim();
}

export function roleAliases(role) {
  const clean = normalizeRef(role);
  const aliases = new Set([clean]);
  if (clean.includes("chief executive") || clean === "ceo") aliases.add("ceo");
  if (clean.includes("chief product") || clean === "cpo") aliases.add("cpo");
  if (clean.includes("head of product")) aliases.add("head of product");
  if (clean.includes("head of sales")) aliases.add("head of sales");
  if (clean.includes("web")) aliases.add("pm of web");
  if (clean.includes("professional sellers")) aliases.add("pm of professionals");
  return aliases;
}

function findUniquePerson(list, predicate) {
  const matches = (list || []).filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * @param {string} ref           raw reference from model output or user text
 * @param {Array<Array>} pools   ordered candidate pools, e.g. [participants, allPeople]
 * @returns {Object|null} the resolved person or null
 */
export function resolvePersonRef(ref, pools = []) {
  const rawToken = String(ref || "").toLowerCase().trim();
  const token = normalizeRef(ref);
  if (!token) return null;
  for (const pool of pools) {
    const exact =
      findUniquePerson(
        pool,
        (p) =>
          p.id.toLowerCase() === rawToken ||
          normalizeRef(p.id) === token ||
          normalizeRef(p.name) === token ||
          firstName(p.name) === token
      ) || null;
    if (exact) return exact;
    const roleExact = findUniquePerson(pool, (p) => roleAliases(p.role).has(token));
    if (roleExact) return roleExact;
    const roleFuzzy = findUniquePerson(pool, (p) => {
      const role = normalizeRef(p.role);
      return token.length >= 6 && role && (role.includes(token) || token.includes(role));
    });
    if (roleFuzzy) return roleFuzzy;
  }
  return null;
}

/**
 * Auto-Read ("The Read") logic, kept pure so the threshold and cache-bust are
 * testable without React or a model call. The Auto-Read reuses the existing
 * strategist endpoint with a fixed internal question; it does not add a model
 * path or relax the Phase-7 grounding and banned-trait guard.
 */

export const AUTO_READ_QUESTION =
  "What is the single most important thing I am missing in this room, and who should I move first?";

export const AUTO_READ_MIN_PARTICIPANTS = 4;
export const AUTO_READ_MIN_EDGES = 2;

/** The Read only runs once a room is rich enough to be worth reading. */
export function autoReadEligible(participantCount = 0, edgeCount = 0) {
  return participantCount >= AUTO_READ_MIN_PARTICIPANTS && edgeCount >= AUTO_READ_MIN_EDGES;
}

/**
 * Cache key for a decision's read. Changes only when the strategic inputs change:
 * grid placements, positions, and network edges. Title or note edits do not
 * bust it, so we do not pay for a regenerate on every render or text tweak.
 */
export function autoReadSignature(decision, edges = []) {
  if (!decision) return "";
  const placements = decision.placements || {};
  const positions = decision.positions || {};
  const p = Object.keys(placements)
    .sort()
    .map((id) => `${id}:${placements[id]?.power}/${placements[id]?.interest}/${placements[id]?.confidence || "high"}`)
    .join(",");
  const s = Object.keys(positions)
    .sort()
    .map((id) => `${id}=${positions[id]}`)
    .join(",");
  const e = (edges || [])
    .map((x) => `${x.from}>${x.to}:${x.type}`)
    .sort()
    .join(",");
  return `${decision.id}|${p}|${s}|${e}`;
}

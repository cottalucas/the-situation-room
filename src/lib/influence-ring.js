/**
 * Pure geometry and interaction logic for the Influence Ring (Network lens).
 * No React, no DOM, no store: just math, so the layout, edge clipping, and the
 * two-gesture drag decisions are unit-testable offline.
 *
 * Ring position encodes influence over THIS decision:
 *   Ring 0  self    center, always You
 *   Ring 1  high    r 140, the people who can block or approve
 *   Ring 2  medium  r 260, must be consulted (also where null lands)
 *   Ring 3  low     r 380, informed, execution only
 */

export const CENTER = 400;
export const VIEWBOX = 800;
export const RING_RADIUS = { 1: 140, 2: 260, 3: 380 };
export const NODE_RADIUS = { self: 40, high: 30, medium: 24, low: 20 };
export const ROTATION_STEP = Math.PI / 6;
export const EDGE_TYPES = ["ally", "conflict", "defers"];
export const EDGE_LABEL = { ally: "Ally", conflict: "Conflict", defers: "Defers to" };

const RING_FOR_LEVEL = { high: 1, medium: 2, low: 3 };
const LEVEL_FOR_RING = { 1: "high", 2: "medium", 3: "low" };

/** The ring a level lands on. null / unknown levels default to ring 2 (medium). */
export function ringForLevel(level) {
  return RING_FOR_LEVEL[level] || 2;
}
export function levelForRing(ring) {
  return LEVEL_FOR_RING[ring] || "medium";
}

/** Node radius for an influence level (self overrides). null reads as medium. */
export function nodeRadiusFor(level, isSelf = false) {
  if (isSelf) return NODE_RADIUS.self;
  return NODE_RADIUS[level] || NODE_RADIUS.medium;
}

/**
 * Place every participant on its ring, distributed evenly with a per-ring
 * rotation stagger so nodes do not stack on the same angle across rings.
 * @returns {Array<{id,name,role,isSelf,level,ring,x,y,r,angle}>}
 */
export function ringLayout(participants = [], influence = {}) {
  const self = participants.find((p) => p.isSelf);
  const others = participants.filter((p) => !p.isSelf);

  const nodes = [];
  if (self) {
    nodes.push({ id: self.id, name: self.name, role: self.role, isSelf: true, level: "self", ring: 0, x: CENTER, y: CENTER, r: NODE_RADIUS.self, angle: 0 });
  }

  const byRing = { 1: [], 2: [], 3: [] };
  others.forEach((p) => {
    const level = influence[p.id]?.level || null;
    byRing[ringForLevel(level)].push({ person: p, level });
  });

  [1, 2, 3].forEach((ring) => {
    const group = byRing[ring];
    const radius = RING_RADIUS[ring];
    const count = group.length;
    const offset = ROTATION_STEP * ring;
    group.forEach((entry, index) => {
      const angle = count > 0 ? (2 * Math.PI / count) * index + offset : offset;
      const renderLevel = entry.level || "medium";
      nodes.push({
        id: entry.person.id,
        name: entry.person.name,
        role: entry.person.role,
        isSelf: false,
        level: renderLevel,
        rawLevel: entry.level,
        ring,
        x: CENTER + radius * Math.cos(angle),
        y: CENTER + radius * Math.sin(angle),
        r: nodeRadiusFor(renderLevel),
        angle,
      });
    });
  });

  return nodes;
}

/** Straight line between two node centers, clipped to stop at each node's edge. */
export function clipLine(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: from.x + ux * from.r,
    y1: from.y + uy * from.r,
    x2: to.x - ux * to.r,
    y2: to.y - uy * to.r,
  };
}

/** Edge stroke color. defers uses a token; ally/conflict use fixed hues. */
export function edgeColor(type) {
  if (type === "ally") return "#1D9E75";
  if (type === "conflict") return "#E24B4A";
  return "var(--line-strong)";
}
export function edgeStrokeWidth(type) {
  return type === "defers" ? 1 : 1.5;
}

/**
 * Which drag gesture a pointer starts, by where it lands on the node:
 *   within 60% of the radius -> move (reposition between rings)
 *   60% to 100% of the radius -> edge (draw a relationship)
 *   beyond the radius -> none
 */
export function gestureForRadius(distFromNodeCenter, nodeRadius) {
  if (distFromNodeCenter <= nodeRadius * 0.6) return "move";
  if (distFromNodeCenter <= nodeRadius) return "edge";
  return null;
}

/** The ring (and so the level) nearest a radius from canvas center, for drop-snap. */
export function nearestRing(radiusFromCenter) {
  let best = 1;
  let bestDist = Infinity;
  [1, 2, 3].forEach((ring) => {
    const d = Math.abs(radiusFromCenter - RING_RADIUS[ring]);
    if (d < bestDist) {
      bestDist = d;
      best = ring;
    }
  });
  return best;
}

/** The write a center-drag drop produces: a user-set (overridden) influence level. */
export function centerDropWrite(personId, dropRadiusFromCenter) {
  return { personId, level: levelForRing(nearestRing(dropRadiusFromCenter)), overridden: true };
}

/** The write a relationship-picker selection produces. */
export function edgeWrite(from, to, type) {
  if (!from || !to || from === to) return null;
  if (!EDGE_TYPES.includes(type)) return null;
  return { from, to, type };
}

/** Cancel (Escape or invalid drop) produces no write. */
export function cancelDrag() {
  return null;
}

/** Top-right label positions for each ring guide. */
export function ringLabelPositions() {
  const a = -Math.PI / 4; // top-right
  return [
    { ring: 1, level: "high", label: "High influence", radius: RING_RADIUS[1] },
    { ring: 2, level: "medium", label: "Medium", radius: RING_RADIUS[2] },
    { ring: 3, level: "low", label: "Low", radius: RING_RADIUS[3] },
  ].map((l) => ({ ...l, x: CENTER + l.radius * Math.cos(a), y: CENTER + l.radius * Math.sin(a) }));
}

/** Distance helper. */
export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

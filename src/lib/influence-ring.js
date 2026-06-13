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
// Node radius encodes influence directly: larger reads as more influence. self is
// the largest and darkest; unknown sits between medium and low, styled apart.
export const NODE_RADIUS = { self: 36, high: 30, medium: 24, low: 19, unknown: 22 };
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

/** Node radius for a render level (self overrides). Unknown has its own size. */
export function nodeRadiusFor(level, isSelf = false) {
  if (isSelf) return NODE_RADIUS.self;
  return NODE_RADIUS[level] || NODE_RADIUS.medium;
}

/** The angle (radians) of a point measured from the ring center. Inverse of the
 * placement below, so a drag drop point maps back to a storable angularPosition. */
export function angleFromCenter(x, y) {
  return Math.atan2(y - CENTER, x - CENTER);
}

/**
 * The default angle a person sits at before anyone drags them. It is derived
 * ONLY from a stable, id-sorted slot across the whole roster, never from which
 * ring they currently occupy. That is the whole point: a person's default angle
 * does not depend on how many people share their ring, so changing one person's
 * influence (their ring) can never shift anyone else. Even distribution around
 * the circle keeps nodes from overlapping for any realistic room size.
 */
export function defaultAngleFor(personId, others = []) {
  const ordered = [...others].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = ordered.length || 1;
  const slot = Math.max(0, ordered.findIndex((p) => p.id === personId));
  return (2 * Math.PI / total) * slot;
}

/**
 * Place every participant on its ring. Each person OWNS their angle. A stored
 * influence.angle (from a drag, or a persisted default) is used verbatim. A
 * person without one falls back to defaultAngleFor, which is stable per identity
 * and independent of ring membership, so correctness does not depend on the
 * default ever being persisted: moving one person changes exactly one person's
 * position, with or without a write landing. Unstored nodes carry
 * needsPersist:true so the renderer can still claim the default to storage.
 *
 * Changing a person's ring keeps their angle and only changes the radius.
 * @returns {Array<{id,name,role,isSelf,level,ring,x,y,r,angle,needsPersist}>}
 */
export function ringLayout(participants = [], influence = {}) {
  const self = participants.find((p) => p.isSelf);
  const others = participants.filter((p) => !p.isSelf);

  const nodes = [];
  if (self) {
    nodes.push({ id: self.id, name: self.name, role: self.role, isSelf: true, level: "self", ring: 0, x: CENTER, y: CENTER, r: NODE_RADIUS.self, angle: 0, needsPersist: false });
  }

  others.forEach((p) => {
    const rec = influence[p.id] || {};
    const level = rec.level || null;
    const ring = ringForLevel(level);
    const radius = RING_RADIUS[ring];
    const storedAngle = Number.isFinite(rec.angle) ? rec.angle : null;
    const hasStored = storedAngle !== null;
    const angle = hasStored ? storedAngle : defaultAngleFor(p.id, others);
    // null influence still lands on ring 2, but renders as its own ambiguous
    // "unknown" style (warm gray, dashed) rather than masquerading as medium.
    const renderLevel = level || "unknown";
    nodes.push({
      id: p.id,
      name: p.name,
      role: p.role,
      isSelf: false,
      level: renderLevel,
      rawLevel: level,
      ring,
      x: CENTER + radius * Math.cos(angle),
      y: CENTER + radius * Math.sin(angle),
      r: nodeRadiusFor(renderLevel),
      angle,
      needsPersist: !hasStored,
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

/** Label positions: centered at the top of each ring arc, sitting just above it. */
export function ringLabelPositions() {
  const gap = 14; // viewBox units the label floats above its ring arc
  return [
    { ring: 1, level: "high", label: "High influence", radius: RING_RADIUS[1] },
    { ring: 2, level: "medium", label: "Medium", radius: RING_RADIUS[2] },
    { ring: 3, level: "low", label: "Low", radius: RING_RADIUS[3] },
  ].map((l) => ({ ...l, x: CENTER, y: CENTER - l.radius - gap }));
}

/**
 * SVG path for a filled annulus (ring band) between two concentric radii, drawn
 * with the even-odd fill rule so the inner disc is a hole. Used for the subtle
 * tinted influence zones behind the guides.
 */
export function annulusPath(rOuter, rInner) {
  const circle = (r) =>
    `M ${CENTER - r} ${CENTER} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
  return `${circle(rOuter)} ${circle(rInner)}`;
}

/**
 * Where the relationship picker should anchor: just above the midpoint of the
 * two connected nodes, flipped below when that would clip the top edge. Returned
 * in viewBox coords; placement tells the overlay which side to grow toward.
 */
export function pickerAnchor(a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const offset = 36; // viewBox units off the midpoint, clearing both nodes
  const margin = 90; // keep clear of the canvas edges
  let y = my - offset;
  let placement = "above";
  if (y < margin) {
    y = my + offset;
    placement = "below";
  }
  return { x: mx, y, placement };
}

/** Distance helper. */
export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

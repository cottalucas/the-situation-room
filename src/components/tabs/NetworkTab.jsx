import React, { useMemo } from "react";
import { networkPositions, EDGE_META } from "../../data/seed.js";
import { Chip } from "../Chip.jsx";

function trimLine(from, to, sp, ep) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x1: from.x + (dx / len) * sp,
    y1: from.y + (dy / len) * sp,
    x2: to.x - (dx / len) * ep,
    y2: to.y - (dy / len) * ep,
  };
}
const FB = { x: 50, y: 50 };

function firstName(person) {
  return (person?.name || "").split(" ")[0].toLowerCase();
}

function seedPositionFor(person) {
  return networkPositions[person.id] || networkPositions[firstName(person)] || null;
}

function roleLevel(role) {
  const value = String(role || "").toLowerCase();
  if (/\bceo\b|chief executive/.test(value)) return 0;
  if (/\bcpo\b|chief product/.test(value)) return 1;
  if (/head|lead/.test(value)) return 2;
  return 3;
}

function laneWeight(person) {
  const value = `${person.name || ""} ${person.role || ""}`.toLowerCase();
  if (/\bceo\b|chief executive|\bcpo\b|chief product|head of product/.test(value)) return 50;
  if (/engineer|engineering/.test(value)) return 24;
  if (/professional|seller/.test(value)) return 36;
  if (/\bweb\b/.test(value)) return 64;
  if (/sales/.test(value)) return 76;
  if (/ux|design/.test(value)) return 84;
  return 50;
}

function spreadRow(row) {
  const sorted = [...row].sort((a, b) => laneWeight(a.person) - laneWeight(b.person) || a.index - b.index);
  if (sorted.length === 1) return [[sorted[0], laneWeight(sorted[0].person)]];
  return sorted.map((item, itemIndex) => [item, 16 + (68 * itemIndex) / (sorted.length - 1)]);
}

function autoNetworkPositions(participants, edges) {
  if (!participants.length) return {};
  const visible = new Set(participants.map((p) => p.id));
  const levels = new Map(participants.map((person) => [person.id, roleLevel(person.role)]));
  const defersEdges = edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to) && edge.type === "defers");

  for (let i = 0; i < participants.length; i += 1) {
    let changed = false;
    defersEdges.forEach((edge) => {
      const fromLevel = levels.get(edge.from) ?? 3;
      const toLevel = levels.get(edge.to) ?? 2;
      const next = Math.max(fromLevel, toLevel + 1);
      if (next !== fromLevel) {
        levels.set(edge.from, next);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const ranked = participants.map((person, index) => ({ person, index, level: levels.get(person.id) ?? 3 }));
  const levelValues = [...new Set(ranked.map((item) => item.level))].sort((a, b) => a - b);
  const rows = levelValues.map((level) => ranked.filter((item) => item.level === level));
  const yByRows = rows.length === 1 ? [50] : rows.map((_, index) => 14 + (70 * index) / (rows.length - 1));
  const out = {};

  rows.forEach((row, rowIndex) => {
    spreadRow(row).forEach(([item, x]) => {
      out[item.person.id] = { x, y: yByRows[rowIndex] };
    });
  });

  return out;
}

/**
 * Influence map. Typed edges between participants, with the recommended
 * sequence lit up as an ordered path after a play.
 */
export function NetworkTab({ participants, decision, edges, onRemoveEdge, selectedId, onOpenProfile, sequence, showPath }) {
  const visible = new Set(participants.map((p) => p.id));
  const liveEdges = edges.filter((e) => visible.has(e.from) && visible.has(e.to));
  const allSeeded = participants.length > 0 && participants.every((p) => seedPositionFor(p));
  const layout = useMemo(() => {
    if (allSeeded) return Object.fromEntries(participants.map((p) => [p.id, seedPositionFor(p)]));
    return autoNetworkPositions(participants, liveEdges);
  }, [allSeeded, participants, liveEdges]);
  const pos = (id) => layout[id] || FB;

  const pathSegs = useMemo(() => {
    if (!showPath || !sequence || sequence.length < 2) return [];
    const segs = [];
    for (let i = 0; i < sequence.length - 1; i++) {
      segs.push(trimLine(pos(sequence[i]), pos(sequence[i + 1]), 7, 9));
    }
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence, showPath]);

  const stepOf = useMemo(() => {
    const m = {};
    if (showPath && sequence) sequence.forEach((id, i) => (m[id] = i + 1));
    return m;
  }, [sequence, showPath]);

  return (
    <div className="net-zone">
      <div className="net-canvas">
        <svg className="net-svg">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--ink-faint)" />
            </marker>
            <marker id="arr-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--ink)" />
            </marker>
          </defs>
          {liveEdges.map((e, i) => {
            const t = trimLine(pos(e.from), pos(e.to), 7, e.type === "defers" ? 9 : 7);
            return (
              <React.Fragment key={i}>
                <line x1={`${t.x1}%`} y1={`${t.y1}%`} x2={`${t.x2}%`} y2={`${t.y2}%`}
                  stroke={EDGE_META[e.type].color} strokeWidth="1.5"
                  strokeOpacity={showPath ? 0.2 : 0.8}
                  markerEnd={e.type === "defers" ? "url(#arr)" : undefined}
                  style={{ pointerEvents: "none" }} />
              </React.Fragment>
            );
          })}
          {pathSegs.map((t, i) => (
            <line key={`p${i}`} className="net-path" x1={`${t.x1}%`} y1={`${t.y1}%`} x2={`${t.x2}%`} y2={`${t.y2}%`}
              markerEnd="url(#arr-hot)" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </svg>
        {participants.map((p) => {
          const pp = pos(p.id);
          return (
            <Chip key={p.id} person={p} position={decision.positions[p.id]} selected={p.id === selectedId}
              onClick={() => onOpenProfile(p.id)} badge={stepOf[p.id]}
              style={{ left: `${pp.x}%`, top: `${pp.y}%`, "--ty": "-50%", animation: "none" }} />
          );
        })}
      </div>
      <div className="legend">
        <span className="legend-item"><span className="edge-swatch edge-ally" />Ally</span>
        <span className="legend-item"><span className="edge-swatch edge-conflict" />Conflict</span>
        <span className="legend-item"><span className="edge-swatch edge-defers" />Defers to</span>
        {showPath && <span className="legend-item"><span className="edge-swatch edge-path" />Sequence</span>}
      </div>
    </div>
  );
}

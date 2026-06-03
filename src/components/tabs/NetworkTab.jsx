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

/**
 * Influence map. Typed edges between participants, with the recommended
 * sequence lit up as an ordered path after a play.
 */
export function NetworkTab({ participants, decision, edges, onRemoveEdge, selectedId, onOpenProfile, sequence, showPath }) {
  const visible = new Set(participants.map((p) => p.id));
  const pos = (id) => networkPositions[id] || FB;
  const liveEdges = edges.filter((e) => visible.has(e.from) && visible.has(e.to));

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
                <line className="net-hit" x1={`${t.x1}%`} y1={`${t.y1}%`} x2={`${t.x2}%`} y2={`${t.y2}%`}
                  stroke={EDGE_META[e.type].color} strokeWidth="7" strokeOpacity="0"
                  onClick={() => onRemoveEdge(edges.indexOf(e))} />
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
        <span className="legend-hint">click an edge to remove</span>
      </div>
    </div>
  );
}

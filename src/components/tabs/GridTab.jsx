import React, { useRef } from "react";
import { POSITION_META } from "../../lib/frameworks.js";
import { Chip } from "../Chip.jsx";

/**
 * Power and Interest grid. People are draggable to adjust their placement; a
 * plain click without a drag opens the compact profile.
 */
export function GridTab({ participants, decision, selectedId, onOpenProfile, onMove }) {
  const plotRef = useRef(null);
  const drag = useRef(null);

  const makePointer = (id) => ({
    down: (e) => {
      const rect = plotRef.current.getBoundingClientRect();
      drag.current = { id, moved: false, rect };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    move: (e) => {
      const d = drag.current;
      if (!d || d.id !== id) return;
      if (d.startX == null) {
        d.startX = e.clientX;
        d.startY = e.clientY;
      }
      if (d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) {
        d.moved = true;
        const { rect } = d;
        const x = Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(3, Math.min(97, (1 - (e.clientY - rect.top) / rect.height) * 100));
        onMove(id, Math.round(y), Math.round(x));
      }
    },
    up: () => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved) onOpenProfile(d.id);
      drag.current = null;
    },
  });

  return (
    <div className="grid-zone">
      <div className="grid-frame">
        <div className="axis axis-y">
          <span className="axis-name">Power</span>
          <span className="axis-lohi axis-lohi-top">high</span>
          <span className="axis-lohi axis-lohi-bottom">low</span>
        </div>
        <div className="grid-plot" ref={plotRef}>
          <div className="quadrants">
            <div className="quad quad-satisfied"><span className="quad-label">Keep satisfied</span></div>
            <div className="quad quad-manage"><span className="quad-label">Manage closely</span></div>
            <div className="quad quad-monitor"><span className="quad-label">Monitor</span></div>
            <div className="quad quad-informed"><span className="quad-label">Keep informed</span></div>
          </div>
          {participants.map((p, i) => {
            const pl = decision.placements?.[p.id] || { power: 50, interest: 55 };
            return (
              <Chip
                key={p.id}
                person={p}
                position={decision.positions[p.id]}
                selected={p.id === selectedId}
                pointer={makePointer(p.id)}
                style={{
                  left: `${pl.interest}%`,
                  bottom: `${pl.power}%`,
                  animationDelay: `${0.1 * i + 0.12}s`,
                }}
              />
            );
          })}
        </div>
        <div className="axis axis-x">
          <span className="axis-lohi axis-lohi-left">low</span>
          <span className="axis-name">Interest</span>
          <span className="axis-lohi axis-lohi-right">high</span>
        </div>
      </div>
      <div className="legend">
        {["for", "against", "neutral", "unknown"].map((p) => (
          <span key={p} className="legend-item">
            <span className={`chip-dot dot-${p} legend-dot`} />
            {POSITION_META[p].label}
          </span>
        ))}
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { quadrantFor, frameworkChips, POSITION_META } from "../lib/frameworks.js";
import { Avatar, PositionBadge, QuadChip } from "./primitives.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

function truncate(text, max = 130) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

/**
 * Tier 1: the condensed person overlay. A quick glance only, never the full
 * record. Header (name, role, position-status, quadrant, Power/Interest), the
 * driver in one line, the last two notes, and the mapped frameworks as compact
 * state-label chips. The chips are entry points, not content: no tooltip, no
 * popover. The only explainer is the single quiet link to /frameworks. "View
 * full profile" opens the person page (Tier 2). Centered on mobile, floating on
 * desktop.
 */
export function PersonProfile({ person, position, placement, onClose, onViewFull, onOpenFrameworks }) {
  const mobile = useIsMobile();
  const ref = useRef(null);
  const drag = useRef(null);
  const [pos, setPos] = useState(null);

  // Desktop floats to the right and can be dragged; mobile is centered by CSS.
  useEffect(() => {
    if (mobile) {
      setPos(null);
      return;
    }
    setPos({ x: Math.max(24, window.innerWidth - 384 - 40), y: 96 });
  }, [mobile]);

  useEffect(() => {
    if (mobile) return undefined;
    const move = (e) => {
      if (!drag.current) return;
      setPos({ x: e.clientX - drag.current.ox, y: e.clientY - drag.current.oy });
    };
    const up = () => (drag.current = null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [mobile]);

  const startDrag = (e) => {
    if (mobile) return;
    const rect = ref.current.getBoundingClientRect();
    drag.current = { ox: e.clientX - rect.left, oy: e.clientY - rect.top };
    e.preventDefault();
  };

  const stance = position || "unknown";
  const pi = placement || { power: 50, interest: 55 };
  const quad = quadrantFor(pi.power, pi.interest);
  const chips = frameworkChips(person);
  const recentNotes = (person.observations || [])
    .filter((o) => o.source !== "history")
    .slice(-2)
    .reverse();

  const card = (
    <div
      ref={ref}
      className={`profile profile-condensed ${mobile ? "profile-centered" : ""}`}
      style={mobile || !pos ? undefined : { left: pos.x, top: pos.y }}
    >
      <div className="profile-grip" onMouseDown={startDrag}>
        {!mobile && <span className="grip-dots">. . .</span>}
        <button className="profile-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="profile-body">
        <div className="condensed-head">
          <Avatar name={person.name} size="lg" />
          <h2 className="profile-name">{person.name}</h2>
          {person.role && <p className="condensed-role">{person.role}</p>}
          <div className="condensed-meta">
            <PositionBadge position={stance} />
            <QuadChip quad={quad} />
          </div>
          <p className="condensed-scores">
            Power {pi.power} · Interest {pi.interest}
          </p>
        </div>

        {person.goal && (
          <p className="condensed-driver">
            <span className="condensed-driver-label">Driver</span>
            {truncate(person.goal, 110)}
          </p>
        )}

        <div className="condensed-section">
          <span className="section-label">Recent activity</span>
          {recentNotes.length ? (
            <ul className="condensed-notes">
              {recentNotes.map((o, i) => (
                <li key={i}>{truncate(o.text)}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-text small">No notes yet.</p>
          )}
        </div>

        <div className="condensed-section">
          <span className="section-label">Frameworks</span>
          {chips.length ? (
            <div className="condensed-chips">
              {chips.map((c) => (
                <span key={c.key} className="fw-state-chip" style={{ "--accent": c.accent }}>
                  <span className="fw-state-name">{c.framework}</span>
                  <span className="fw-state-label">{c.label}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="muted-text small">Not mapped yet. Add notes to build the read.</p>
          )}
          <button type="button" className="fw-quiet-link" onClick={onOpenFrameworks}>
            Understand the frameworks
          </button>
        </div>

        <button type="button" className="btn-secondary condensed-full" onClick={() => onViewFull(person.id)}>
          View full profile
        </button>
      </div>
    </div>
  );

  if (mobile) {
    return (
      <div className="profile-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {card}
      </div>
    );
  }
  if (!pos) return null;
  return card;
}

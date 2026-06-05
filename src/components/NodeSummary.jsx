import React from "react";
import { Avatar, PositionBadge } from "./primitives.jsx";
import { scarfStateLabel } from "../lib/frameworks.js";

function truncate(text, max = 90) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

/**
 * Task 8: the floating summary shown when a node is selected on the graph. A
 * small card, not a second profile view: name, the decision last touched, the
 * last one or two notes, and key scores (Power/Interest, SCARF state). Tapping
 * the card opens the person profile page.
 */
export function NodeSummary({ person, position, placement, decisionTitle, onOpen, onClose }) {
  if (!person) return null;
  const pi = placement || { power: 50, interest: 55 };
  const scarf = scarfStateLabel(person);
  const notes = (person.observations || [])
    .filter((o) => o.source !== "history")
    .slice(-2)
    .reverse();

  return (
    <div className="node-summary" role="dialog" aria-label={`${person.name} summary`}>
      <button type="button" className="node-summary-close" onClick={onClose} aria-label="Close summary">
        ✕
      </button>
      <button type="button" className="node-summary-main" onClick={() => onOpen(person.id)}>
        <div className="node-summary-head">
          <Avatar name={person.name} size="sm" />
          <div className="node-summary-id">
            <span className="node-summary-name">{person.name}</span>
            <PositionBadge position={position || "unknown"} size="xs" />
          </div>
        </div>
        {decisionTitle && <p className="node-summary-decision">On {decisionTitle}</p>}
        {notes.length > 0 && (
          <ul className="node-summary-notes">
            {notes.map((o, i) => (
              <li key={i}>{truncate(o.text)}</li>
            ))}
          </ul>
        )}
        <p className="node-summary-scores">
          Power {pi.power} · Interest {pi.interest}
          {scarf && <span className="node-summary-scarf"> · SCARF {scarf}</span>}
        </p>
        <span className="node-summary-cta">Open profile ›</span>
      </button>
    </div>
  );
}

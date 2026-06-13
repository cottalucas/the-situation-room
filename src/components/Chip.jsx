import React from "react";
import { shortNameOf } from "../lib/frameworks.js";

/**
 * A person token used on the Grid and Network. Optional pointer handlers make
 * it draggable (Grid); otherwise it is a click target (Network).
 */
export function Chip({ person, position, selected, style, badge, onClick, pointer, needsConfirm }) {
  const pos = position || "unknown";
  const self = Boolean(person.isSelf);
  const display = self ? "You" : person.name;
  const initials = self ? "You" : shortNameOf(person.name);
  return (
    <button
      className={`chip ${selected ? "chip-selected" : ""} ${pointer ? "chip-draggable" : ""} ${needsConfirm ? "chip-needs-confirm" : ""} ${self ? "chip-self" : ""}`}
      style={style}
      onClick={onClick}
      onPointerDown={pointer?.down}
      onPointerMove={pointer?.move}
      onPointerUp={pointer?.up}
      title={needsConfirm ? `${display}, ${person.role} — low confidence, confirm` : `${display}, ${person.role}`}
    >
      <span className={`chip-dot dot-${pos}`} />
      <span className="chip-initials">{initials}</span>
      {badge != null && <span className="chip-step">{badge}</span>}
      <span className="chip-name">
        {display}
        <span className="chip-role">{person.role}</span>
      </span>
    </button>
  );
}

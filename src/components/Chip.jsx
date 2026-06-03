import React from "react";
import { shortNameOf } from "../lib/frameworks.js";

/**
 * A person token used on the Grid and Network. Optional pointer handlers make
 * it draggable (Grid); otherwise it is a click target (Network).
 */
export function Chip({ person, position, selected, style, badge, onClick, pointer }) {
  const pos = position || "unknown";
  return (
    <button
      className={`chip ${selected ? "chip-selected" : ""} ${pointer ? "chip-draggable" : ""}`}
      style={style}
      onClick={onClick}
      onPointerDown={pointer?.down}
      onPointerMove={pointer?.move}
      onPointerUp={pointer?.up}
      title={`${person.name}, ${person.role}`}
    >
      <span className={`chip-dot dot-${pos}`} />
      <span className="chip-initials">{shortNameOf(person.name)}</span>
      {badge != null && <span className="chip-step">{badge}</span>}
      <span className="chip-name">
        {person.name}
        <span className="chip-role">{person.role}</span>
      </span>
    </button>
  );
}

import React from "react";
import { Avatar, PositionBadge } from "../primitives.jsx";

/**
 * People lens. The participants in this decision as readable rows. Clicking a
 * row opens the full profile. The whole roster joins by default; here you remove
 * a participant or add an external.
 */
export function PeopleTab({ participants, decision, onOpenProfile, onAddExternal, onRemoveParticipant }) {
  if (participants.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◦</div>
        <p className="empty-title">No participants</p>
        <p className="empty-sub">Everyone was removed. Add someone external to this decision.</p>
        <button className="btn-primary" onClick={onAddExternal}>
          Add external
        </button>
      </div>
    );
  }

  const externals = new Set(decision.externalIds || []);

  return (
    <div className="people-tab">
      <div className="people-actions">
        <button className="btn-secondary btn-sm" onClick={onAddExternal}>
          + Add external
        </button>
      </div>

      <ul className="people-list">
        {participants.map((p) => {
          const stance = decision.positions[p.id] || "unknown";
          return (
            <li key={p.id} className={`person-row ${p.isSelf ? "person-row-self" : ""}`} onClick={() => onOpenProfile(p.id)}>
              <Avatar name={p.name} self={p.isSelf} />
              <div className="person-row-main">
                <div className="person-row-top">
                  <span className="person-row-name">{p.isSelf ? "You" : p.name}</span>
                  {p.isSelf && <span className="self-tag">You</span>}
                  {externals.has(p.id) && <span className="ext-tag">External</span>}
                  <PositionBadge position={stance} size="xs" />
                </div>
                <span className="person-row-role">{p.role}</span>
                {p.goal && <span className="person-row-driver">{p.goal}</span>}
              </div>
              <button
                className="person-remove"
                title="Remove from this decision"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveParticipant(p.id);
                }}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

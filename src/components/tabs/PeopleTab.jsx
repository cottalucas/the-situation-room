import React, { useEffect, useRef } from "react";
import { Avatar, PositionBadge } from "../primitives.jsx";
import { trackEvent } from "../../lib/firebase.js";

// First-run starters. Tapping pre-fills the input (never auto-sends), so a new
// user discovers the @-command loop and can edit before running. chip_id is a
// safe analytics token only: no names, no note text.
const FIRST_RUN_CHIPS = [
  { id: "note_example", cmd: "@note Dana is the VP of Sales and is skeptical" },
  { id: "grid_example", cmd: "@grid Dana has high power, low interest" },
  { id: "network_example", cmd: "@network Dana defers to the CEO" },
  { id: "prose_example", cmd: "Dana is skeptical and the CEO defers to her" },
];

/**
 * People lens. The participants in this decision as readable rows. Clicking a
 * row opens the full profile. The whole roster joins by default; here you remove
 * a participant or add an external. When the decision holds no one but You, a
 * first-run state teaches the loop and seeds the first command.
 */
export function PeopleTab({ participants, decision, onOpenProfile, onAddPerson, onRemoveParticipant, onPrefill }) {
  const hasRealParticipant = participants.some((p) => !p.isSelf);
  const firstRun = participants.length > 0 && !hasRealParticipant;

  // Fire once per decision when the first-run state is shown.
  const shownFor = useRef(null);
  useEffect(() => {
    if (firstRun && decision?.id && shownFor.current !== decision.id) {
      shownFor.current = decision.id;
      trackEvent("onboarding_empty_state_shown");
    }
  }, [firstRun, decision?.id]);

  if (participants.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◦</div>
        <p className="empty-title">No participants</p>
        <p className="empty-sub">Everyone was removed. Add someone back from this room, or add an external.</p>
        <button className="btn-primary" onClick={onAddPerson}>
          Add person
        </button>
      </div>
    );
  }

  if (firstRun) {
    return (
      <div className="empty-state">
        <p className="empty-title">Map the people behind this decision.</p>
        <p className="empty-sub">Map the room, read the room, move the room.</p>
        <div className="prompt-chips">
          {FIRST_RUN_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="prompt-chip"
              onClick={() => {
                trackEvent("onboarding_chip_tapped", { chip_id: c.id });
                onPrefill?.(c.cmd);
              }}
            >
              {c.cmd}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const externals = new Set(decision.externalIds || []);

  return (
    <div className="people-tab">
      <div className="people-actions">
        <button className="btn-secondary btn-sm" onClick={onAddPerson}>
          + Add person
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

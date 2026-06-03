import React, { useState, useRef, useEffect } from "react";
import { quadrantFor, POSITION_META } from "../lib/frameworks.js";
import { Avatar, PositionBadge, QuadChip } from "./primitives.jsx";
import { FrameworkVisuals } from "./FrameworkVisuals.jsx";

/* A field that shows text and, in full variant, edits inline. */
function EditableField({ value, placeholder, editable, onSave, multiline }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => setDraft(value || ""), [value]);

  if (!editable) {
    return value ? <span>{value}</span> : <span className="muted-text">{placeholder}</span>;
  }
  if (editing) {
    const commit = () => {
      onSave(draft.trim());
      setEditing(false);
    };
    return multiline ? (
      <textarea
        className="inline-edit"
        value={draft}
        rows={3}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    ) : (
      <input
        className="inline-edit"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    );
  }
  return (
    <button className="editable-text" onClick={() => setEditing(true)} title="Click to edit">
      {value || <span className="muted-text">{placeholder}</span>}
      <span className="edit-pencil">edit</span>
    </button>
  );
}

/**
 * Draggable, dismissible person profile.
 *   variant="compact"  the quick read from Grid or Network.
 *   variant="full"     the rich, editable view from the People tab.
 */
export function PersonProfile({ person, position, variant = "compact", onClose, onSave }) {
  const full = variant === "full";
  const ref = useRef(null);
  const drag = useRef(null);
  const [pos, setPos] = useState(null);

  // Center on first mount, then stay where dragged.
  useEffect(() => {
    const w = full ? 460 : 380;
    setPos({ x: Math.max(24, window.innerWidth - w - 40), y: 96 });
  }, [full]);

  useEffect(() => {
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
  }, []);

  const startDrag = (e) => {
    const rect = ref.current.getBoundingClientRect();
    drag.current = { ox: e.clientX - rect.left, oy: e.clientY - rect.top };
    e.preventDefault();
  };

  if (!pos) return null;
  const stance = position || "unknown";
  const quad = quadrantFor(person.power, person.interest);

  return (
    <div
      ref={ref}
      className={`profile profile-${variant}`}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="profile-grip" onMouseDown={startDrag}>
        <span className="grip-dots">. . .</span>
        <button className="profile-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="profile-body">
        <div className="profile-head">
          <Avatar name={person.name} size="lg" />
          <div className="profile-id">
            <h2 className="profile-name">{person.name}</h2>
            <div className="profile-role">
              <EditableField
                value={person.role}
                placeholder="Add a role"
                editable={full}
                onSave={(v) => onSave?.({ role: v })}
              />
            </div>
          </div>
          <PositionBadge position={stance} />
        </div>

        <div className="profile-meta">
          <QuadChip quad={quad} />
          <span className="muted-text">
            Power {person.power}, Interest {person.interest}
          </span>
        </div>

        {(person.goal || full) && (
          <div className="profile-block">
            <span className="section-label">Driver</span>
            <p className="profile-goal">
              <EditableField
                value={person.goal}
                placeholder="What are they actually trying to achieve?"
                editable={full}
                multiline
                onSave={(v) => onSave?.({ goal: v })}
              />
            </p>
          </div>
        )}

        <div className="profile-block">
          <span className="section-label">Frameworks</span>
          <FrameworkVisuals person={person} />
        </div>

        <div className="profile-block">
          <span className="section-label">
            Notes <span className="privacy-tag">On device</span>
          </span>
          {person.notes?.length ? (
            <ul className="notes-list">
              {person.notes.map((n, i) => (
                <li key={i} className="note-item">
                  {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text small">
              None yet. Add one from the chat: <code>@notes {person.name.split(" ")[0]} ...</code>
            </p>
          )}
        </div>

        {full && (
          <div className="profile-block">
            <span className="section-label">History across decisions</span>
            {person.history?.length ? (
              <ul className="history-list">
                {person.history.map((h, i) => (
                  <li key={i} className="history-item">
                    <span className={`history-dot dot-${h.stance}`} />
                    <div>
                      <span className="history-decision">{h.decision}</span>
                      <span className="history-note">{h.note}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-text small">No past decisions recorded yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

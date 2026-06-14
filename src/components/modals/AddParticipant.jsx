import React, { useState } from "react";
import { Modal } from "./Modal.jsx";
import { Avatar } from "../primitives.jsx";

/**
 * Add someone to this decision: bring back a roster member who is not currently
 * in the decision, or add a new external person scoped to this decision only.
 * Re-adding a roster member resolves to their existing record, so removing and
 * re-adding never creates a duplicate.
 */
export function AddParticipant({ rosterAvailable, onAddExisting, onAddExternal, onClose }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const submitExternal = (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    onAddExternal(cleanName, role.trim());
  };

  return (
    <Modal
      title="Add to decision"
      sub="Bring back someone from this room, or add a new external person scoped to this decision."
      onClose={onClose}
    >
      {rosterAvailable.length > 0 && (
        <div className="field">
          <label className="field-label">From this room</label>
          <p className="field-help">Roster members not in this decision yet.</p>
          <div className="directory-list">
            {rosterAvailable.map((p) => (
              <button key={p.id} className="add-row" onClick={() => onAddExisting(p.id)}>
                <Avatar name={p.name} size="sm" self={p.isSelf} />
                <div className="roster-info">
                  <span className="roster-name">
                    {p.isSelf ? "You" : p.name}
                    {p.isSelf && <span className="self-tag">You</span>}
                  </span>
                  <span className="roster-role">{p.role || (p.isSelf ? "The operator" : "")}</span>
                </div>
                <span className="add-icon">+</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="field" onSubmit={submitExternal}>
        <label className="field-label">Add someone new</label>
        <p className="field-help">An external person, scoped to this decision only. They do not join the room roster.</p>
        <div className="field-grid-two">
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <input className="field-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role or context" />
        </div>
        <button className="btn-primary btn-sm btn-add-external" type="submit" disabled={!name.trim()}>
          Add external
        </button>
      </form>
    </Modal>
  );
}

import React, { useState } from "react";
import { Modal } from "./Modal.jsx";

/** Add a person scoped to this decision only, not to the room roster. */
export function AddExternal({ onAdd, onClose }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  return (
    <Modal
      title="Add external"
      sub="This person joins this decision only. They do not become a permanent room member."
      onClose={onClose}
    >
      <div className="field">
        <label className="field-label">Name</label>
        <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoFocus />
      </div>
      <div className="field">
        <label className="field-label">Role or context</label>
        <input className="field-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="CFO, signs off on budget" />
      </div>
      <div className="field-actions">
        <button className="btn-primary" disabled={!name.trim()} onClick={() => onAdd(name.trim(), role.trim())}>
          Add to decision
        </button>
      </div>
    </Modal>
  );
}

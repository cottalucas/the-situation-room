import React, { useState } from "react";
import { Modal } from "./Modal.jsx";

/**
 * Create a decision. The whole room roster joins as participants by default.
 * You adjust who is in it from the People tab afterward.
 */
export function NewDecision({ rosterCount, onCreate, onClose }) {
  const [title, setTitle] = useState("");
  const [deciding, setDeciding] = useState("");
  const [goal, setGoal] = useState("");
  const [constraint, setConstraint] = useState("");

  return (
    <Modal
      title="New decision"
      sub={`All ${rosterCount} roster members join by default. Adjust participants in the People tab.`}
      wide
      onClose={onClose}
    >
      <div className="field">
        <label className="field-label">Title</label>
        <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunsetting legacy Salesforce" autoFocus />
      </div>
      <div className="field">
        <label className="field-label">Deciding what</label>
        <input className="field-input" value={deciding} onChange={(e) => setDeciding(e.target.value)} placeholder="The call being made" />
      </div>
      <div className="field">
        <label className="field-label">Goal</label>
        <input className="field-input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What success looks like" />
      </div>
      <div className="field">
        <label className="field-label">Constraint</label>
        <input className="field-input" value={constraint} onChange={(e) => setConstraint(e.target.value)} placeholder="Deadlines or conditions" />
      </div>
      <div className="field-actions">
        <button
          className="btn-primary"
          disabled={!title.trim()}
          onClick={() => onCreate({ title: title.trim(), context: { deciding, goal, constraint } })}
        >
          Create decision
        </button>
      </div>
    </Modal>
  );
}

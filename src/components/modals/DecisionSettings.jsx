import React, { useState } from "react";
import { Modal } from "./Modal.jsx";
import { formatDate } from "../../lib/frameworks.js";

/**
 * Edit a decision: title, context spine, deadline (real date picker), and the
 * archive action. Context lives here, not on the main canvas.
 */
export function DecisionSettings({ decision, onClose, onSave, onArchive }) {
  const [title, setTitle] = useState(decision.title);
  const [deciding, setDeciding] = useState(decision.context?.deciding || "");
  const [goal, setGoal] = useState(decision.context?.goal || "");
  const [constraint, setConstraint] = useState(decision.context?.constraint || "");
  const [deadline, setDeadline] = useState(decision.deadline || "");

  const save = () => onSave({ title, context: { deciding, goal, constraint }, deadline });

  return (
    <Modal title="Decision settings" wide onClose={onClose}>
      <div className="field">
        <label className="field-label">Title</label>
        <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} />
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
      <div className="field">
        <label className="field-label">Deadline</label>
        <div className="field-row">
          <input
            className="field-input field-date"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          {deadline && <span className="date-display">{formatDate(deadline)}</span>}
        </div>
      </div>

      <div className="field-actions">
        <button className="btn-primary" onClick={save}>
          Save
        </button>
        {decision.status === "active" && (
          <button className="btn-danger btn-archive-decision" onClick={onArchive}>
            Close and archive decision
          </button>
        )}
      </div>
    </Modal>
  );
}

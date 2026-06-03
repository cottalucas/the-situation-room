import React, { useState } from "react";
import { Modal } from "./Modal.jsx";

/**
 * Destructive confirmation. If `phrase` is set, the user must type it to enable
 * the confirm button. Used for room delete, where the whole room is wiped.
 */
export function ConfirmModal({ title, body, phrase, confirmLabel = "Delete", onConfirm, onClose }) {
  const [typed, setTyped] = useState("");
  const armed = !phrase || typed.trim() === phrase;

  return (
    <Modal title={title} onClose={onClose}>
      <p className="confirm-body">{body}</p>
      {phrase && (
        <div className="field">
          <label className="field-label">
            Type <span className="confirm-phrase">{phrase}</span> to confirm
          </label>
          <input
            className="field-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={phrase}
            autoFocus
          />
        </div>
      )}
      <div className="field-actions">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-danger-solid" disabled={!armed} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

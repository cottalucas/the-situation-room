import React, { useState } from "react";
import { Modal } from "./Modal.jsx";

/**
 * Destructive confirmation. If `phrase` is set, the user must type it to enable
 * the confirm button.
 */
export function ConfirmModal({ title, body, phrase, confirmLabel = "Delete", onConfirm, onClose }) {
  const [typed, setTyped] = useState("");
  const cleanPhrase = phrase?.trim();
  const armed = !cleanPhrase || typed.trim().toLowerCase() === cleanPhrase.toLowerCase();

  return (
    <Modal title={title} onClose={onClose}>
      <p className="confirm-body">{body}</p>
      {cleanPhrase && (
        <div className="field">
          <label className="field-label">
            Type <span className="confirm-phrase">{cleanPhrase}</span> to confirm
          </label>
          <input
            className="field-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={cleanPhrase}
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

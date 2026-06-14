import React, { useState } from "react";
import { Modal } from "./modals/Modal.jsx";

export const POSITIONS = ["PM", "Engineering", "Design", "Exec", "Other"];

/**
 * The shared Profile view. Name and position are optional; email is owned by the
 * sign-in provider and shown only as read-only context.
 */
export function ProfileModal({ name: initialName, email, position: initialPosition, onSave, onClose }) {
  const [name, setName] = useState(initialName || "");
  const [position, setPosition] = useState(initialPosition || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    setError("");
    setSaving(true);
    try {
      await onSave({ name: trimmed, position });
      setSaved(true);
    } catch (err) {
      setError(err?.message || "Profile could not be saved.");
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  const edit = (setter) => (value) => {
    setter(value);
    if (saved) setSaved(false);
    if (error) setError("");
  };

  return (
    <Modal title="Profile" onClose={onClose}>
      <form className="profile-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Name</span>
          <input className="field-input" value={name} onChange={(e) => edit(setName)(e.target.value)} placeholder="Your name" />
        </label>

        <label className="field">
          <span className="field-label field-label-row">
            <span>Email</span>
            <span className="field-badge">Read-only</span>
          </span>
          <input className="field-input field-readonly" value={email || ""} readOnly disabled />
        </label>

        <label className="field">
          <span className="field-label">Position</span>
          <select className="field-input" value={position} onChange={(e) => edit(setPosition)(e.target.value)}>
            <option value="">
              No position selected
            </option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="profile-error" role="alert">{error}</p>}
        {saved && !error && <p className="profile-saved" role="status">Saved.</p>}

        <div className="field-actions">
          <button type="submit" className="btn-primary btn-save-profile" disabled={saving}>
            {saving ? "Saving" : "Save profile"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

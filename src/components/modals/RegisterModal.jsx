import React, { useState } from "react";
import { Modal } from "./Modal.jsx";

/**
 * Registration. UI only for now; collects the fields auth will need.
 * TODO: wire auth (Prompt 2). Submit and the Google button currently enter the
 * app without creating an account.
 */
export function RegisterModal({ onClose, onEnter }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e) => {
    e.preventDefault();
    // TODO: wire auth (Prompt 2)
    onEnter();
  };

  return (
    <Modal title="Create your account" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field-label">Name</label>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
        </div>
        <div className="field">
          <label className="field-label">Work email</label>
          <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div className="field">
          <label className="field-label">Password</label>
          <input className="field-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <button className="btn-primary btn-block" type="submit">
          Create account
        </button>
      </form>
      <div className="auth-divider"><span>or</span></div>
      {/* TODO: wire auth (Prompt 2) */}
      <button className="btn-google" onClick={onEnter}>
        Continue with Google
      </button>
    </Modal>
  );
}

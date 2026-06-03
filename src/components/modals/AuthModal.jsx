import React, { useEffect, useState } from "react";
import { Modal } from "./Modal.jsx";
import { registerEmail, signInEmail, signInGoogle } from "../../lib/auth.js";

const CONFIG_ERROR =
  "Firebase is not configured in this build. Restart the dev server after adding .env.local, or rebuild before deploying.";

function authErrorMessage(err, fallback) {
  if (err?.code === "auth/unauthorized-domain") {
    return "This local URL is not authorized for sign in. Use localhost, or add this domain in Firebase Auth settings.";
  }
  return err.message?.replace("Firebase: ", "") || fallback;
}

export function AuthModal({ initialTab = "register", configured, localPreview = false, onClose, onLocalEnter }) {
  const [tab, setTab] = useState(initialTab);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError("");
    setBusy(false);
  }, [tab]);

  const useLocalPreview = () => {
    if (localPreview) {
      onLocalEnter();
      return true;
    }
    setError(CONFIG_ERROR);
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!configured) return useLocalPreview();

    setBusy(true);
    setError("");
    try {
      if (tab === "register") await registerEmail({ name, email, password });
      else await signInEmail({ email, password });
    } catch (err) {
      setError(authErrorMessage(err, tab === "register" ? "Could not create the account." : "Could not sign in."));
      setBusy(false);
    }
  };

  const google = async () => {
    if (!configured) return useLocalPreview();

    setBusy(true);
    setError("");
    try {
      await signInGoogle();
    } catch (err) {
      setError(authErrorMessage(err, "Google sign in failed."));
      setBusy(false);
    }
  };

  const isRegister = tab === "register";

  return (
    <Modal title="Get started" onClose={onClose}>
      <div className="auth-tabs" role="tablist" aria-label="Authentication options">
        <button
          type="button"
          className={`auth-tab ${isRegister ? "auth-tab-active" : ""}`}
          onClick={() => setTab("register")}
          role="tab"
          aria-selected={isRegister}
        >
          Register
        </button>
        <button
          type="button"
          className={`auth-tab ${!isRegister ? "auth-tab-active" : ""}`}
          onClick={() => setTab("signin")}
          role="tab"
          aria-selected={!isRegister}
        >
          Sign in
        </button>
      </div>

      <form onSubmit={submit}>
        {isRegister && (
          <div className="field">
            <label className="field-label">Name</label>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
          </div>
        )}
        <div className="field">
          <label className="field-label">{isRegister ? "Work email" : "Email"}</label>
          <input
            className="field-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus={!isRegister}
          />
        </div>
        <div className="field">
          <label className="field-label">Password</label>
          <input
            className="field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? "At least 8 characters" : "Your password"}
            minLength={isRegister ? 8 : undefined}
          />
        </div>
        {error && <p className="auth-error">{error}</p>}
        <button className="btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? (isRegister ? "Creating..." : "Signing in...") : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="auth-divider">
        <span>or</span>
      </div>
      <button className="btn-google" onClick={google} disabled={busy}>
        Continue with Google
      </button>
      {localPreview && <p className="auth-note">Preview mode uses device-local data.</p>}
    </Modal>
  );
}

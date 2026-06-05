import React, { useState, useRef, useEffect } from "react";
import { Avatar } from "./primitives.jsx";

/**
 * Task 3: the web account menu. Clicking the user's name/avatar at top-right
 * opens a dropdown holding the account layer: "Signed in as [name]", Profile,
 * Frameworks, and Sign out. Same items and order as the mobile drawer. This is
 * the account menu, not a settings page.
 */
export function AccountMenu({ name, email, onProfile, onFrameworks, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const label = name || email || "Account";

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn) => () => {
    setOpen(false);
    fn?.();
  };

  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-trigger" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={label} size="sm" />
        <span className="account-name">{label}</span>
        <span className="account-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <span className="account-head-label">Signed in as</span>
            <span className="account-head-name">{name || email || "Account"}</span>
          </div>
          <button type="button" className="account-item" role="menuitem" onClick={run(onProfile)}>
            Profile
          </button>
          <button type="button" className="account-item" role="menuitem" onClick={run(onFrameworks)}>
            Frameworks
          </button>
          <button type="button" className="account-item account-item-divider" role="menuitem" onClick={run(onSignOut)}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

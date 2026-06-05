import React, { useEffect } from "react";
import { Rail } from "./Rail.jsx";

/**
 * Right-side mobile drawer. Rooms and decisions use the shared rail; the account
 * section mirrors the desktop account menu.
 */
export function MobileDrawer({ open, onClose, onSignOut, onProfile, onFrameworks, accountName, railProps }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Selecting a room or decision (or starting a new one) should also close the
  // drawer so the user lands straight on the content. Close first so the drawer
  // still closes if the wrapped action surfaces an error. Room also closes the
  // drawer from an effect when guided setup activates, which covers the new-room
  // path where the action's synchronous store commit can swallow this close.
  const wrap = (fn) => (...args) => {
    onClose();
    fn?.(...args);
  };

  return (
    <div className="drawer-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label="Navigation">
        <div className="drawer-top">
          <span className="drawer-title">Navigation</span>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <Rail
            {...railProps}
            collapsed={false}
            onToggleCollapse={undefined}
            onSelectRoom={wrap(railProps.onSelectRoom)}
            onSelectDecision={wrap(railProps.onSelectDecision)}
            onNewRoom={wrap(railProps.onNewRoom)}
            onNewDecision={wrap(railProps.onNewDecision)}
          />
        </div>
        <div className="drawer-foot">
          {accountName && (
            <div className="drawer-account-head">
              <span className="account-head-label">Signed in as</span>
              <span className="account-head-name">{accountName}</span>
            </div>
          )}
          <button type="button" className="drawer-account-item" onClick={() => { onClose(); onProfile?.(); }}>
            Profile
          </button>
          <button type="button" className="drawer-account-item" onClick={() => { onClose(); onFrameworks?.(); }}>
            Frameworks
          </button>
          <button type="button" className="drawer-account-item drawer-account-signout" onClick={() => { onClose(); onSignOut?.(); }}>
            Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}

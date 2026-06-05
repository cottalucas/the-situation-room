import React, { useEffect } from "react";
import { Chat } from "./Chat.jsx";

/**
 * Task 4: the floating command companion. A persistent control fixed at the
 * bottom-right on every lens, NOT a support chatbot. Collapsed it is a pill with
 * a command glyph and "Command the room" on People, and a compact slash control
 * on graph lenses so it does not cover the map. Expanded it opens the full-screen
 * mobile command view, with the placeholder "Command the room, or type /". It is
 * fixed, not draggable, and closeable. All existing chat and command behavior,
 * including the "Grounded in" chips, is preserved.
 */
export function CommandCompanion({ open, onOpen, onClose, chatProps }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return (
      <button type="button" className="command-pill" onClick={onOpen} aria-label="Command the room">
        <span className="command-pill-glyph" aria-hidden="true">/</span>
        <span className="command-pill-label">Command the room</span>
      </button>
    );
  }

  return (
    <div className="command-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="command-panel" role="dialog" aria-label="Command the room">
        <div className="command-panel-top">
          <span className="command-panel-title">
            <span className="command-pill-glyph" aria-hidden="true">/</span>
            Command the room
          </span>
          <button type="button" className="command-panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <Chat {...chatProps} placeholder="Command the room, or type /" />
      </div>
    </div>
  );
}

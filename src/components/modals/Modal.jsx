import React from "react";

/** Shared modal shell. Click the backdrop or the close button to dismiss. */
export function Modal({ title, sub, wide, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {sub && <p className="modal-sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

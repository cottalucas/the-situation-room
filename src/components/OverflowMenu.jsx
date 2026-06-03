import React, { useState } from "react";

/**
 * A "..." trigger that opens a small menu on hover or click. Items can be
 * marked danger. Closes on outside click or after an item runs.
 */
export function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="overflow">
      <button
        className="overflow-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="More actions"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="overflow-catch" onClick={() => setOpen(false)} />
          <div className="overflow-menu">
            {items.map((it) => (
              <button
                key={it.label}
                className={`overflow-item ${it.danger ? "overflow-danger" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

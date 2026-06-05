import React from "react";
import { Avatar } from "./primitives.jsx";

function displayNotes(person) {
  return (person.observations || []).filter((o) => o.source !== "history").slice().reverse();
}

/** Full encrypted notes history for one person. */
export function PersonNotesPage({ person, onBack, onOpenMenu }) {
  const notes = displayNotes(person);

  return (
    <div className="page person-notes-page">
      <div className="page-bar page-bar-app page-desktop-bar">
        <button type="button" className="page-back" onClick={onBack}>
          ‹ Profile
        </button>
        <span className="page-brand">The Situation Room</span>
      </div>
      <div className="page-mobile-top">
        <span className="page-brand">The Situation Room</span>
        <button className="burger page-menu" onClick={onOpenMenu} aria-label="Open menu">
          <span />
          <span />
          <span />
        </button>
      </div>
      <div className="page-mobile-back">
        <button type="button" className="page-back" onClick={onBack}>
          ‹ Profile
        </button>
      </div>
      <div className="page-scroll">
        <header className="person-page-head">
          <Avatar name={person.name} size="lg" />
          <div className="person-page-id">
            <span className="msg-label">Notes</span>
            <h1 className="page-title">{person.name}</h1>
            <p className="person-notes-meta">
              <span className="privacy-tag">Encrypted</span>
              <span>{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
            </p>
          </div>
        </header>

        <section className="person-page-block">
          {notes.length ? (
            <ul className="notes-list notes-list-long">
              {notes.map((o, i) => (
                <li key={`${o.ts || "note"}-${i}`} className="note-item note-item-long">
                  {o.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text small">
              None yet. Add one from the command bar: <code>@note {person.name.split(" ")[0]} ...</code>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

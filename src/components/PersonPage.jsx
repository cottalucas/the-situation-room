import React, { useState, useEffect } from "react";
import { quadrantFor, SCARF_ALL, SCARF_COLORS, TKI_COLORS } from "../lib/frameworks.js";
import { Avatar, PositionBadge, QuadChip } from "./primitives.jsx";

/* Inline editor for the person's own fields. Read-only until clicked. */
function EditableField({ value, placeholder, editable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => setDraft(value || ""), [value]);

  if (!editable) return value ? <span>{value}</span> : <span className="muted-text">{placeholder}</span>;
  if (editing) {
    const commit = () => {
      onSave(draft.trim());
      setEditing(false);
    };
    return (
      <input
        className="inline-edit"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    );
  }
  return (
    <button className="editable-text" onClick={() => setEditing(true)} title="Click to edit">
      {value || <span className="muted-text">{placeholder}</span>}
      <span className="edit-pencil">edit</span>
    </button>
  );
}

function splitLevers(value) {
  return String(value || "")
    .split("·")
    .map((l) => l.trim())
    .filter(Boolean);
}

function FrameworkVisual({ type, tags, levers }) {
  if (type === "scarf") {
    const active = new Set(tags.scarfDimensions || []);
    return (
      <div className="scarf-dims framework-visual-scarf" aria-label="SCARF dimensions">
        {SCARF_ALL.map((dim) => {
          const on = active.has(dim);
          return (
            <span
              key={dim}
              className={`scarf-pill ${on ? "" : "scarf-off"}`}
              style={on ? { background: SCARF_COLORS[dim], color: "#fff" } : undefined}
              title={dim}
            >
              {dim[0]}
            </span>
          );
        })}
      </div>
    );
  }

  if (type === "tki") {
    if (!tags.tkiStyle) return <span className="framework-empty">Not mapped yet</span>;
    return (
      <span className="tki-badge" style={{ background: TKI_COLORS[tags.tkiStyle] || "var(--ink-faint)" }}>
        {tags.tkiStyle}
      </span>
    );
  }

  if (type === "cialdini") {
    if (!levers.length) return <span className="framework-empty">Not mapped yet</span>;
    return (
      <div className="cialdini-chips">
        {levers.map((lever) => (
          <span className="cialdini-chip" key={lever}>
            {lever}
          </span>
        ))}
      </div>
    );
  }

  if (!tags.fuTeaser) return <span className="framework-empty">Not mapped yet</span>;
  return <span className="fu-teaser">{tags.fuTeaser}</span>;
}

function NoteList({ notes }) {
  return (
    <ul className="notes-list">
      {notes.map((o, i) => (
        <li key={`${o.ts || "note"}-${i}`} className="note-item">
          {o.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * Dedicated page for a single person. Holds the person's driver, recent notes,
 * mapped framework state, and route to all notes. Generic framework explanation
 * never lives here; the quiet explainer link routes to the shared framework page.
 */
export function PersonPage({ person, position, placement, onBack, onSave, onDelete, onOpenFrameworks, onOpenNotes, onOpenMenu, embedded = false }) {
  const stance = position || "unknown";
  const pi = placement || { power: 50, interest: 55 };
  const quad = quadrantFor(pi.power, pi.interest);
  const read = person.baseRead || {};
  const tags = person.visualTags || {};
  const levers = splitLevers(tags.cialdiniLever);

  const observations = person.observations || [];
  const notes = observations.filter((o) => o.source !== "history").slice().reverse();
  const history = observations.filter((o) => o.source === "history");
  const recentNotes = notes.slice(0, 2);

  const mappings = [
    { key: "scarf", name: "SCARF", rationale: read.scarf },
    { key: "tki", name: "Thomas-Kilmann", rationale: read.tki },
    { key: "cialdini", name: "Cialdini", rationale: read.cialdini },
    { key: "fisher", name: "Fisher & Ury", rationale: read.fisherUry },
  ];

  const body = (
    <div className="page-scroll">
      <header className="person-page-head">
        <Avatar name={person.name} size="lg" />
        <div className="person-page-id">
          <h1 className="page-title">
            <EditableField
              value={person.name}
              placeholder="Add a name"
              editable
              onSave={(v) => {
                const name = v.trim();
                if (name) onSave?.({ name });
              }}
            />
          </h1>
          <div className="person-page-role">
            <EditableField value={person.role} placeholder="Add a role" editable onSave={(v) => onSave?.({ role: v })} />
          </div>
        </div>
      </header>

      <div className="person-page-meta">
          <PositionBadge position={stance} />
          <QuadChip quad={quad} />
          <span className="muted-text">
            Power {pi.power}, Interest {pi.interest}
          </span>
        </div>

        <section className="person-page-block">
          <span className="section-label">Driver</span>
          <p className="profile-goal profile-goal-readonly">
            {person.goal || <span className="muted-text">No driver recorded yet.</span>}
          </p>
        </section>

        <section className="person-page-block">
          <div className="notes-preview-head">
            <span className="section-label">
              Recent activity <span className="privacy-tag">Encrypted</span>
            </span>
            {notes.length > 2 && (
              <button type="button" className="notes-more" onClick={() => onOpenNotes?.(person.id)}>
                View all notes ({notes.length})
              </button>
            )}
          </div>
          {recentNotes.length ? (
            <NoteList notes={recentNotes} />
          ) : (
            <p className="muted-text small">
              None yet. Add one from the command bar: <code>@note {person.name.split(" ")[0]} ...</code>
            </p>
          )}
        </section>

        <section className="person-page-block">
          <span className="section-label">Frameworks for {person.name.split(" ")[0]}</span>
          <ul className="framework-overview-list">
            {mappings.map((m) => (
              <li key={m.name} className="framework-overview-row">
                <div className="framework-overview-copy">
                  <span className="framework-overview-name">{m.name}</span>
                  {m.rationale ? (
                    <p className="framework-overview-rationale">{m.rationale}</p>
                  ) : (
                    <p className="framework-overview-rationale muted-text">Not mapped yet.</p>
                  )}
                </div>
                <div className="framework-overview-visual">
                  <FrameworkVisual type={m.key} tags={tags} levers={levers} />
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="fw-quiet-link" onClick={onOpenFrameworks}>
            Understand the frameworks
          </button>
        </section>

        <section className="person-page-block">
          <span className="section-label">History across decisions</span>
          {history.length ? (
            <ul className="history-list">
              {history.map((o, i) => (
                <li key={i} className="history-item">
                  <span className="history-dot dot-neutral" />
                  <div>
                    <span className="history-note">{o.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text small">No past decisions recorded yet.</p>
          )}
        </section>

        {onDelete && (
          <div className="profile-danger">
            <button className="btn-danger" onClick={() => onDelete(person.id)}>
              Remove from roster
            </button>
          </div>
        )}
    </div>
  );

  // Embedded: lives inside the People column, so the rooms rail and the
  // conversation panel stay visible. Just a back control + the content.
  if (embedded) {
    return (
      <div className="person-page-embedded">
        <div className="person-embedded-bar">
          <button type="button" className="page-back" onClick={onBack}>
            ‹ People
          </button>
        </div>
        {body}
      </div>
    );
  }

  // Full-screen fallback (kept for direct deep links to a person route).
  return (
    <div className="page person-page">
      <div className="page-bar page-bar-app page-desktop-bar">
        <button type="button" className="page-back" onClick={onBack}>
          ‹ People
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
          ‹ People
        </button>
      </div>
      {body}
    </div>
  );
}

import React from "react";
import { FRAMEWORK_REFERENCE } from "../lib/frameworks.js";

/**
 * Tier 3: the shared frameworks reference. Generic, person-independent content
 * explaining each lens, its states, and how to read it. No person data ever
 * appears here. Plain layout, one section per framework, no tooltips or nested
 * modals. Reached from the person page and the condensed overlay.
 */
export function FrameworksPage({ onBack, onOpenMenu }) {
  return (
    <div className="page frameworks-page">
      <div className="page-bar page-bar-app page-desktop-bar">
        <button type="button" className="page-back" onClick={onBack}>
          ‹ Back
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
          ‹ Back
        </button>
      </div>
      <div className="page-scroll">
        <header className="page-head">
          <span className="msg-label">Reference</span>
          <h1 className="page-title">The frameworks</h1>
          <p className="page-lede">
            Four lenses the room uses to suggest how to approach a person. Each reads observable behavior and stated
            positions, never fixed personality. This page explains them generically. The mapped state for a specific
            person lives on that person.
          </p>
        </header>

        {FRAMEWORK_REFERENCE.map((fw) => (
          <section key={fw.key} className="fw-ref">
            <h2 className="fw-ref-name">{fw.name}</h2>
            <p className="fw-ref-tagline">{fw.tagline}</p>
            <p className="fw-ref-what">{fw.what}</p>
            <dl className="fw-ref-states">
              {fw.states.map(([term, meaning]) => (
                <div key={term} className="fw-ref-state">
                  <dt>{term}</dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="fw-ref-read">
              <span className="fw-ref-read-label">How to read it</span>
              {fw.read}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}

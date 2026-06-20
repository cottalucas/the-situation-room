import React, { useState } from "react";
import { AuthModal } from "../components/modals/AuthModal.jsx";

/**
 * Public marketing page. Get started opens the combined auth modal. When
 * Firebase is configured it creates or uses a real account. Local preview is
 * available only when explicitly enabled by env.
 */
export default function Landing({ onLocalEnter, configured, localPreview = false }) {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="landing-brand">The Situation Room</span>
        <button className="landing-register" onClick={() => setAuthOpen(true)}>
          Get started
        </button>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <span className="eyebrow">For managers and operators who move decisions through people</span>
          <h1 className="landing-title">The Situation Room</h1>
          <p className="landing-prop">
            Read the room before you walk into it. Map who holds power, who cares, and who
            moves whom. Walk in with the play already half won.
          </p>
          <div className="landing-cta-row">
            <button className="landing-cta" onClick={() => setAuthOpen(true)}>
              Get started →
            </button>
          </div>
        </section>

        <section className="landing-how">
          <span className="landing-how-label">How it works</span>
          <div className="landing-steps">
            <Step n="01" title="Describe your team" glyph="text" body="Name who is in the room, who reports to whom, and where the friction sits. Plain language, no forms. The room remembers them for next time." />
            <Step n="02" title="See the map" glyph="map" body="People land on a Power and Interest grid and an influence network. You see who to spend energy on and who quietly moves whom." />
            <Step n="03" title="Get the play" glyph="play" body="Ask a real situation. Get a sequenced play, grounded in SCARF, Cialdini, and interest based negotiation. The exact order of conversations to have." />
          </div>
        </section>

        <section className="landing-why">
          <span className="landing-how-label">Why</span>
          <h2 className="landing-why-title">Most product tools help you decide what to build. This helps you move the room.</h2>
          <p className="landing-why-body">
            Prioritization, strategy, and delivery frameworks make the work clearer. They rarely tell you who needs status, who needs certainty,
            who can block the path, or which conversation has to happen first. The Situation Room turns that political work into a map and a play.
          </p>
        </section>

        <section className="landing-foot">
          <p className="landing-frameworks">
            Grounded in Power and Interest mapping, <strong>SCARF</strong>,{" "}
            <strong>Thomas Kilmann</strong>, <strong>Cialdini</strong>, and interest based
            negotiation. Not vibes.
          </p>
          <p className="landing-privacy-note">
            Your notes are encrypted and stay yours. No sharing, no training.
          </p>
          <p className="landing-colophon">
            © 2026 Lucas Cotta. All rights reserved.{" "}
            <a className="landing-colophon-link" href="https://lucascotta.ch" target="_blank" rel="noreferrer">
              More products by Lucas Cotta
            </a>
          </p>
        </section>
      </main>

      {authOpen && (
        <AuthModal configured={configured} localPreview={localPreview} onLocalEnter={onLocalEnter} onClose={() => setAuthOpen(false)} />
      )}
    </div>
  );
}

function Step({ n, title, body, glyph }) {
  return (
    <div className="landing-step">
      <span className="landing-step-num">{n}</span>
      <h3 className="landing-step-title">{title}</h3>
      <p className="landing-step-body">{body}</p>
      <Glyph kind={glyph} />
    </div>
  );
}

function Glyph({ kind }) {
  if (kind === "text") {
    return (
      <svg className="glyph" viewBox="0 0 64 40" aria-hidden="true">
        <line x1="8" y1="12" x2="52" y2="12" />
        <line x1="8" y1="20" x2="44" y2="20" />
        <line x1="8" y1="28" x2="48" y2="28" />
      </svg>
    );
  }
  if (kind === "map") {
    return (
      <svg className="glyph" viewBox="0 0 64 40" aria-hidden="true">
        <rect x="6" y="6" width="52" height="28" rx="3" />
        <line x1="32" y1="6" x2="32" y2="34" />
        <line x1="6" y1="20" x2="58" y2="20" />
        <circle cx="44" cy="13" r="3.2" className="glyph-dot" />
        <circle cx="18" cy="27" r="3.2" className="glyph-dot" />
        <circle cx="46" cy="26" r="3.2" className="glyph-dot" />
      </svg>
    );
  }
  return (
    <svg className="glyph" viewBox="0 0 64 40" aria-hidden="true">
      <circle cx="12" cy="20" r="4" className="glyph-dot" />
      <line x1="16" y1="20" x2="30" y2="20" />
      <circle cx="34" cy="20" r="4" className="glyph-dot" />
      <line x1="38" y1="20" x2="52" y2="20" />
      <circle cx="56" cy="20" r="4" className="glyph-dot" />
    </svg>
  );
}

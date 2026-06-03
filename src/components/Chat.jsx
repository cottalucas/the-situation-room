import React, { useState, useRef, useEffect } from "react";
import { highlight, RichText } from "./highlight.jsx";
import { Avatar, PositionBadge } from "./primitives.jsx";
import { EXAMPLE_PROMPTS } from "../lib/reasoning.js";

function PlayMessage({ response, people, latest, onShowNetwork }) {
  const [expanded, setExpanded] = useState(false);
  const byId = (id) => people.find((p) => p.id === id);
  return (
    <div className={`chat-msg chat-play ${latest ? "is-latest" : ""}`}>
      <span className="msg-label">The play</span>
      <h3 className="play-headline">{highlight(response.headline, "hl")}</h3>
      <ol className="step-list">
        {response.steps.map((step) => {
          const person = byId(step.person);
          return (
            <li key={step.n} className="step-card">
              <span className="step-num">{step.n}</span>
              <div className="step-body">
                <p className="step-text">{step.text}</p>
                <div className="step-foot">
                  <span className="step-fw">{step.framework}</span>
                  {person && <span className="step-person">{person.name}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="risk-line">
        <span className="risk-label">The risk</span>
        <p className="risk-text">{response.risk.text}</p>
        <p className="risk-signal">{response.risk.signal}</p>
      </div>
      <div className="play-actions">
        <button className="show-network" onClick={onShowNetwork}>
          Show on network →
        </button>
        <button className="expand-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide reasoning" : "Expand reasoning"}
        </button>
      </div>
      {expanded && (
        <div className="reasoning">
          {response.reasoning.map((sec, i) => (
            <section key={i} className="play-section">
              <h4 className="play-title">{sec.title}</h4>
              <div className="play-body">
                <RichText text={sec.body} kp={`r${i}`} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleMessage({ label, variant, latest, children }) {
  return (
    <div className={`chat-msg chat-simple ${variant || ""} ${latest ? "is-latest" : ""}`}>
      {label && <span className="msg-label">{label}</span>}
      {children}
    </div>
  );
}

/* The resting state: a framed card that reads the room at a glance. */
function RestingCard({ participants, decision, onOpenProfile }) {
  const counts = participants.reduce((a, p) => {
    const s = decision.positions[p.id] || "unknown";
    a[s] = (a[s] || 0) + 1;
    return a;
  }, {});
  const decided = (counts.for || 0) + (counts.against || 0);
  const sub =
    participants.length === 0
      ? "Add participants to start reading the room."
      : `${decided} have a clear stance. ${participants.length - decided} are still open. Ask below for the play.`;

  return (
    <div className="resting-card">
      <span className="msg-label">Read the room</span>
      <h3 className="resting-headline">
        {participants.length} {participants.length === 1 ? "person decides" : "people decide"} this.
      </h3>
      <p className="resting-sub">{sub}</p>
      <ul className="resting-list">
        {participants.map((p) => (
          <li key={p.id} className="resting-row" onClick={() => onOpenProfile(p.id)}>
            <Avatar name={p.name} size="sm" />
            <div className="resting-row-main">
              <span className="resting-row-name">{p.name}</span>
              <span className="resting-row-role">{p.role}</span>
            </div>
            <PositionBadge position={decision.positions[p.id] || "unknown"} size="xs" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The conversation. Plays and command confirmations only. Person reads live in
 * the floating profile, never in this stream. The resting state is a framed card.
 */
export function Chat({ messages, participants, decision, onShowNetwork, onOpenProfile, onOpenCommands, draft, setDraft, onSubmit }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resting = messages.length <= 1 && messages[0]?.type === "welcome";
  const last = messages.length - 1;

  return (
    <section className="chat">
      <div className="chat-thread">
        {resting ? (
          <RestingCard participants={participants} decision={decision} onOpenProfile={onOpenProfile} />
        ) : (
          messages.map((m, i) => {
            const latest = i === last;
            if (m.type === "play")
              return (
                <PlayMessage key={m.id} response={m.response} people={participants} latest={latest} onShowNetwork={() => onShowNetwork(m.response)} />
              );
            if (m.type === "note")
              return (
                <SimpleMessage key={m.id} label="Note saved" latest={latest}>
                  <p>Added to <strong>{m.personName}</strong>. {m.text}</p>
                </SimpleMessage>
              );
            if (m.type === "added")
              return (
                <SimpleMessage key={m.id} label="Added to decision" latest={latest}>
                  <p>{m.body}</p>
                </SimpleMessage>
              );
            if (m.type === "welcome") return null;
            return (
              <SimpleMessage key={m.id} label="No read" variant="chat-fallback" latest={latest}>
                <p>{m.body}</p>
              </SimpleMessage>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-input-area">
        <div className="prompt-chips">
          {EXAMPLE_PROMPTS.map((p) => (
            <button key={p} type="button" className="prompt-chip" onClick={() => setDraft(p)}>
              {p}
            </button>
          ))}
        </div>
        <form className="chat-form" onSubmit={onSubmit}>
          <button type="button" className="chat-commands" onClick={onOpenCommands} title="Commands">
            /
          </button>
          <input className="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask a situation, or type / for commands" />
          <button className="chat-send" type="submit">
            Send
          </button>
        </form>
        <p className="chat-hint">
          <code>@notes name text</code> attaches a note. <code>@add name, role</code> adds someone. Or ask a situation.
        </p>
      </div>
    </section>
  );
}

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

function UpdatedMessage({ message, latest }) {
  return (
    <SimpleMessage label={message.label || "Updated"} variant="chat-updated" latest={latest}>
      <p>{message.body}</p>
      {message.questions?.length > 0 && (
        <ul className="chat-questions">
          {message.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}
    </SimpleMessage>
  );
}

function CoachMessage({ message, people, latest, isRead, onCiteClick }) {
  const cited = (message.cites || [])
    .map((id) => people.find((p) => p.id === id))
    .filter(Boolean);
  const label = isRead ? "The Read" : message.grounded === false ? "Off topic" : "Strategist";
  return (
    <SimpleMessage label={label} variant={isRead ? "chat-read" : "chat-coach"} latest={latest}>
      <p>{message.body}</p>
      {message.questions?.length > 0 && (
        <ul className="chat-questions">
          {message.questions.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {cited.length > 0 && (
        <p className="coach-cites">
          Grounded in{" "}
          {cited.map((p, i) => (
            <React.Fragment key={p.id}>
              {onCiteClick ? (
                <button type="button" className="read-chip" onClick={() => onCiteClick(p.id)}>
                  {p.name}
                </button>
              ) : (
                p.name
              )}
              {i < cited.length - 1 ? " " : ""}
            </React.Fragment>
          ))}
        </p>
      )}
    </SimpleMessage>
  );
}

function UserMessage({ body, latest }) {
  return (
    <div className={`chat-msg chat-user ${latest ? "is-latest" : ""}`}>
      <p>{body}</p>
    </div>
  );
}

function LoadingMessage() {
  return (
    <SimpleMessage label="Reading the room" variant="chat-loading" latest>
      <p>Updating the room from this command.</p>
    </SimpleMessage>
  );
}

/* The resting state: a framed card that reads the room at a glance. */
function RestingCard({ participants, decision, onOpenProfile }) {
  const counts = participants.reduce((a, p) => {
    const s = decision?.positions?.[p.id] || "unknown";
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
            <PositionBadge position={decision?.positions?.[p.id] || "unknown"} size="xs" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyConversation() {
  return (
    <div className="conversation-empty">
      <span className="msg-label">Conversation</span>
      <h3 className="resting-headline">The play lives here.</h3>
      <p className="resting-sub">
        Create or select a decision, then ask what to do before the next conversation.
      </p>
    </div>
  );
}

/**
 * The conversation. User prompts and assistant command confirmations alternate
 * in the thread. Person reads live in the floating profile, never in this stream.
 */
export function Chat({ messages, participants, decision, onShowNetwork, onOpenProfile, onCiteClick, onOpenCommands, draft, setDraft, onSubmit, isGenerating, openChat }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resting = messages.length <= 1 && messages[0]?.type === "welcome";
  const last = messages.length - 1;
  const locked = !decision;
  const trimmedDraft = draft.trim();
  const commandReady = trimmedDraft.startsWith("@") || (openChat && trimmedDraft.length > 0);

  return (
    <section className="chat">
      <div className="chat-thread">
        {locked ? (
          <EmptyConversation />
        ) : resting ? (
          <RestingCard participants={participants} decision={decision} onOpenProfile={onOpenProfile} />
        ) : (
          messages.map((m, i) => {
            const latest = i === last;
            if (m.type === "user") return <UserMessage key={m.id} body={m.body} latest={latest} />;
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
            if (m.type === "updated") return <UpdatedMessage key={m.id} message={m} latest={latest} />;
            if (m.type === "coach") return <CoachMessage key={m.id} message={m} people={participants} latest={latest} onCiteClick={onCiteClick} />;
            if (m.type === "read") return <CoachMessage key={m.id} message={m} people={participants} latest={latest} isRead onCiteClick={onCiteClick} />;
            if (m.type === "welcome") return null;
            return (
              <SimpleMessage key={m.id} label="No read" variant="chat-fallback" latest={latest}>
                <p>{m.body}</p>
              </SimpleMessage>
            );
          })
        )}
        {isGenerating && <LoadingMessage />}
        <div ref={endRef} />
      </div>

      <div className="chat-input-area">
        <div className="prompt-chips">
          {EXAMPLE_PROMPTS.map((p) => (
            <button key={p} type="button" className="prompt-chip" onClick={() => setDraft(p)} disabled={locked || isGenerating}>
              {p}
            </button>
          ))}
        </div>
        <form className="chat-form" onSubmit={onSubmit}>
          <button type="button" className="chat-commands" onClick={onOpenCommands} title="Commands" disabled={locked || isGenerating}>
            /
          </button>
          <input
            className="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={locked ? "Create a decision to start the conversation" : openChat ? "Ask about the room, or type @ for a command" : "Type @network, @energy, @map, @note, or /"}
            disabled={locked || isGenerating}
          />
          <button className="chat-send" type="submit" disabled={locked || isGenerating || !commandReady}>
            {isGenerating ? "Reading" : "Send"}
          </button>
        </form>
        <p className="chat-hint">
          {openChat ? (
            <>Ask about the room in plain language, or use a command. <code>@energy</code>, <code>@network</code>, <code>@note</code>, <code>@map</code> build it; <code>@read</code> and <code>@ask</code> read it. Tap <code>/</code> for all.</>
          ) : (
            <>Only commands run here. <code>@energy</code>, <code>@network</code>, <code>@note</code>, and <code>@map</code> build the room. <code>@read</code> and <code>@ask</code> get a strategic read. Tap <code>/</code> for all commands.</>
          )}
        </p>
      </div>
    </section>
  );
}

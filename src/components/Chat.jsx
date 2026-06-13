import React, { useState, useRef, useEffect } from "react";
import { highlight, RichText } from "./highlight.jsx";
import { EXAMPLE_PROMPTS } from "../lib/reasoning.js";

function parsePlay(message) {
  if (message.response && typeof message.response === "object") return message.response;
  try {
    const parsed = JSON.parse(message.body || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A generated play: a pinned, immutable card frozen at generation time. Its
 * inputs are snapshotted into the message (people names, situation), so it stays
 * readable after the room changes or a reload. Visually distinct from chat
 * bubbles, re-openable via the reasoning toggle.
 */
function PlayMessage({ message, people, latest, onShowNetwork }) {
  const [expanded, setExpanded] = useState(false);
  const response = parsePlay(message);
  if (!response) return null;
  // Prefer the frozen snapshot people; fall back to the live participants.
  const snapshot = Array.isArray(response.people) ? response.people : [];
  const byId = (id) => snapshot.find((p) => p.id === id) || people.find((p) => p.id === id);
  return (
    <div className={`chat-msg chat-play chat-play-pinned ${latest ? "is-latest" : ""}`}>
      <span className="msg-label play-pin-label">
        <span className="play-pin" aria-hidden="true">📌</span>
        {message.label || "Play"}
      </span>
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
          {message.questions.map((m, i) => {
            // A move is a string (play coaching, legacy persisted) or an object
            // { move, framework? } from the strategist. The framework chip shows
            // only when the strategist named a lever the room data supported.
            const text = typeof m === "string" ? m : m?.move;
            const framework = typeof m === "object" && m ? m.framework : null;
            if (!text) return null;
            return (
              <li key={i}>
                {text}
                {framework ? <span className="move-fw">{framework}</span> : null}
              </li>
            );
          })}
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

// Controller read, routing flag off: a guidance pill that dispatches the stored
// controller plan on tap. Never mutates state on its own.
function suggestPillLabel(message) {
  if (message.intent === "advise") return "Run @ask";
  if (message.intent === "both") return `Run @${message.command || "map"} plus advice`;
  return `Run @${message.command || message.intent}`;
}
function SuggestMessage({ message, latest, onRunSuggestion }) {
  return (
    <SimpleMessage label="Suggestion" variant="chat-suggest" latest={latest}>
      <p>{message.body}</p>
      <button type="button" className="suggest-pill" onClick={() => onRunSuggestion?.(message)}>
        {suggestPillLabel(message)}
      </button>
    </SimpleMessage>
  );
}

// Low confidence or unclear intent: offer the command menu, no routing.
const SUGGEST_OPTIONS = [
  { label: "Note something about a person", cmd: "@note " },
  { label: "Update someone's influence", cmd: "@network " },
  { label: "Update power or interest", cmd: "@energy " },
  { label: "Ask a question", cmd: "@ask " },
];
function SuggestListMessage({ message, latest, setDraft }) {
  return (
    <SimpleMessage label="Not sure" variant="chat-suggest" latest={latest}>
      <p>{message.body || "I'm not sure how to use this. Did you mean to:"}</p>
      <ul className="suggest-list">
        {SUGGEST_OPTIONS.map((o) => (
          <li key={o.cmd}>
            <button type="button" className="suggest-option" onClick={() => setDraft?.(o.cmd)}>
              {o.label} <code>{o.cmd.trim()}</code>
            </button>
          </li>
        ))}
      </ul>
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
    <SimpleMessage label="Thinking" variant="chat-loading" latest>
      <div className="typing-line" aria-live="polite">
        <span>Working on it</span>
        <span className="typing-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </SimpleMessage>
  );
}

/* The resting state: an open conversation prompt, not a generated room read. */
function ConversationStart() {
  return (
    <div className="resting-card chat-start-card">
      <span className="msg-label">Conversation</span>
      <h3 className="resting-headline">What is on your mind today?</h3>
      <p className="resting-sub">
        Tell me what changed in the room, add a note, or ask a specific question. Use <code>@read</code> when you want a grounded read of the room.
      </p>
      <div className="chat-start-lines">
        <p>Try <code>@note Marco says the drain is getting worse</code></p>
        <p>Or <code>@ask who should I talk to first?</code></p>
      </div>
    </div>
  );
}

function EmptyConversation() {
  return (
    <div className="conversation-empty">
      <span className="msg-label">Conversation</span>
      <h3 className="resting-headline">No decision open.</h3>
      <p className="resting-sub">
        Open a decision in this room, or start a new one.
      </p>
    </div>
  );
}

/**
 * The conversation. User prompts and assistant command confirmations alternate
 * in the thread. Person reads live in the floating profile, never in this stream.
 */
export function Chat({ messages, participants, decision, onShowNetwork, onCiteClick, onOpenCommands, onRunSuggestion, draft, setDraft, onSubmit, isGenerating, openChat, placeholder, autoFocusInput }) {
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
          <ConversationStart />
        ) : (
          messages.map((m, i) => {
            const latest = i === last;
            if (m.type === "user") return <UserMessage key={m.id} body={m.body} latest={latest} />;
            if (m.type === "play")
              return (
                <PlayMessage key={m.id} message={m} people={participants} latest={latest} onShowNetwork={onShowNetwork} />
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
            if (m.type === "suggest") return <SuggestMessage key={m.id} message={m} latest={latest} onRunSuggestion={onRunSuggestion} />;
            if (m.type === "suggest-list") return <SuggestListMessage key={m.id} message={m} latest={latest} setDraft={setDraft} />;
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
            placeholder={locked ? "Open a decision first" : placeholder || (openChat ? "What changed in the room?" : "Type @network, @energy, @map, @note, or /")}
            disabled={locked || isGenerating}
            autoFocus={autoFocusInput}
          />
          <button className="chat-send" type="submit" disabled={locked || isGenerating || !commandReady}>
            {isGenerating ? "Reading" : "Send"}
          </button>
        </form>
        <p className="chat-hint">
          {openChat ? (
            <>Ask about the room in plain language, or use a command. <code>@energy</code>, <code>@network</code>, <code>@note</code>, and <code>@map</code> build it. <code>@read</code> runs only when you send it. Tap <code>/</code> for all.</>
          ) : (
            <>Only commands run here. <code>@energy</code>, <code>@network</code>, <code>@note</code>, and <code>@map</code> build the room. <code>@read</code> runs the room read when you ask for it. Tap <code>/</code> for all commands.</>
          )}
        </p>
      </div>
    </section>
  );
}

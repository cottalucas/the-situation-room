import React, { useEffect, useRef } from "react";
import { useIsMobile } from "../hooks/useIsMobile.js";

/**
 * The single Guided Setup view, driven entirely by props from the engine in
 * Room.jsx. It renders the conversation, a thinking indicator between turns, a
 * question step, a one short naming confirm, and the open-room handoff. The same
 * component backs first-run and the returning-user "+ New room" door.
 */
export function OnboardingChat({
  messages,
  thinking,
  phase, // "questions" | "naming" | "done"
  step,
  totalSteps,
  question,
  skippable,
  draft,
  setDraft,
  nameDraft,
  setNameDraft,
  busy,
  error,
  onSubmit,
  onDismiss,
  onOpenRoom,
  headline,
}) {
  const endRef = useRef(null);
  // Task 1: do not autofocus on mobile, where it forces the keyboard open on
  // load and hides the product. Desktop keeps autofocus.
  const isMobile = useIsMobile();
  const focusOnDesktop = !isMobile;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, busy, error, phase]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const questionLabel = skippable && !draft.trim() ? "Skip" : step === totalSteps - 1 ? "Continue" : "Continue";
  const canSubmitQuestion = skippable || Boolean(draft.trim());

  return (
    <section className="onboarding-chat" aria-label="Guided setup">
      <header className="onboarding-head">
        <span className="msg-label">Guided setup</span>
        <h2>{headline || "Build your first room"}</h2>
        <button type="button" className="onboarding-close" onClick={onDismiss} disabled={busy} aria-label="Close guided setup">
          ✕
        </button>
      </header>

      <div className="onboarding-thread">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`onboarding-msg onboarding-${message.role}`}>
            <p>{message.body}</p>
          </div>
        ))}
        {thinking && (
          <div className="onboarding-msg onboarding-assistant onboarding-thinking" aria-label="Thinking">
            <span className="onboarding-dots">
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
        {busy && (
          <div className="onboarding-msg onboarding-assistant">
            <p>Working through your answer and updating the room…</p>
          </div>
        )}
        {error && (
          <div className="onboarding-error" role="alert">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {phase === "done" ? (
        <div className="onboarding-actions">
          <button type="button" className="btn-primary" onClick={onOpenRoom}>
            Finish
          </button>
        </div>
      ) : phase === "naming" ? (
        <form className="onboarding-form" onSubmit={onSubmit}>
          <label className="onboarding-progress" htmlFor="onboarding-name">
            Name the room
          </label>
          <input
            id="onboarding-name"
            className="onboarding-input onboarding-name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Short name for the decision"
            disabled={busy}
            autoFocus={focusOnDesktop}
          />
          <div className="onboarding-actions">
            <button type="submit" className="btn-primary" disabled={busy || !nameDraft.trim()}>
              Build room
            </button>
          </div>
        </form>
      ) : (
        <form className="onboarding-form" onSubmit={onSubmit}>
          <label className="onboarding-progress" htmlFor="onboarding-answer">
            {question?.id === "roomName" ? "Name your room" : `Question ${step + 1} of ${totalSteps}`}
          </label>
          <textarea
            id="onboarding-answer"
            className="onboarding-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={question?.prompt || ""}
            disabled={busy || thinking}
            rows={4}
            autoFocus={focusOnDesktop}
          />
          <div className="onboarding-actions">
            <button type="submit" className="btn-primary" disabled={busy || thinking || !canSubmitQuestion}>
              {questionLabel}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

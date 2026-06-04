import React, { useEffect, useRef } from "react";
import { ONBOARDING_QUESTIONS } from "../lib/onboarding.js";

export function OnboardingChat({
  messages,
  step,
  draft,
  setDraft,
  busy,
  done,
  error,
  onSubmit,
  onSkip,
  onOpenRoom,
}) {
  const endRef = useRef(null);
  const question = ONBOARDING_QUESTIONS[step];
  const buttonLabel = step === ONBOARDING_QUESTIONS.length - 1 ? "Build room" : "Send";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, error]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <section className="onboarding-chat" aria-label="Guided setup">
      <header className="onboarding-head">
        <span className="msg-label">Guided setup</span>
        <h2>Build your first room</h2>
        <button type="button" className="btn-ghost" onClick={onSkip} disabled={busy}>
          Skip, I will set it up myself
        </button>
      </header>

      <div className="onboarding-thread">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`onboarding-msg onboarding-${message.role}`}>
            <p>{message.body}</p>
          </div>
        ))}
        {busy && (
          <div className="onboarding-msg onboarding-assistant">
            <p>Building the room from your answers.</p>
          </div>
        )}
        {error && (
          <div className="onboarding-error" role="alert">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {done ? (
        <div className="onboarding-actions">
          <button type="button" className="btn-primary" onClick={onOpenRoom}>
            Open room
          </button>
        </div>
      ) : (
        <form className="onboarding-form" onSubmit={onSubmit}>
          <label className="onboarding-progress" htmlFor="onboarding-answer">
            Question {step + 1} of {ONBOARDING_QUESTIONS.length}
          </label>
          <textarea
            id="onboarding-answer"
            className="onboarding-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={question?.prompt || ""}
            disabled={busy}
            rows={4}
            autoFocus
          />
          <div className="onboarding-actions">
            <button type="button" className="btn-secondary" onClick={onSkip} disabled={busy}>
              Skip
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !draft.trim()}>
              {buttonLabel}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

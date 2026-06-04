import React from "react";

/**
 * "The Read" — the always-on strategic read at the top of the room. It reuses the
 * grounded strategist output ({ answer, moves, cites, grounded }) and shows a
 * one-sentence read, up to three moves, and clickable "Grounded in" person chips.
 * Below the participant/edge threshold it shows a calm prompt instead of a blank.
 *
 * @param {Object} props
 * @param {boolean} props.eligible      room has enough people and edges
 * @param {"idle"|"loading"|"ready"|"error"} props.status
 * @param {Object|null} props.result    strategist answer
 * @param {Array} props.participants
 * @param {(id:string)=>void} props.onOpenProfile
 */
export function TheRead({ eligible, status, result, participants, onOpenProfile }) {
  if (!eligible) {
    return (
      <div className="the-read the-read-empty">
        <span className="msg-label">The Read</span>
        <p className="the-read-sub">Map a few more people and relationships and I'll find the play.</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="the-read">
        <span className="msg-label">The Read</span>
        <p className="the-read-sub">Reading the room...</p>
      </div>
    );
  }

  // On error or live-off, stay quiet rather than showing a broken card.
  if (status !== "ready" || !result) return null;

  const cited = (result.cites || [])
    .map((id) => participants.find((p) => p.id === id))
    .filter(Boolean);

  return (
    <div className="the-read">
      <span className="msg-label">The Read</span>
      <p className="the-read-answer">{result.answer}</p>
      {result.moves?.length > 0 && (
        <ol className="the-read-moves">
          {result.moves.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ol>
      )}
      {cited.length > 0 && (
        <p className="the-read-cites">
          Grounded in{" "}
          {cited.map((p, i) => (
            <React.Fragment key={p.id}>
              <button type="button" className="read-chip" onClick={() => onOpenProfile(p.id)}>
                {p.name}
              </button>
              {i < cited.length - 1 ? " " : ""}
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}

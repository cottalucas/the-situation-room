import React from "react";
import { FW_SET, FW_SPLIT_RE } from "../lib/frameworks.js";

/** Wrap framework names in a pill within running text. */
export function highlight(text, kp = "h") {
  return text.split(FW_SPLIT_RE).map((part, i) =>
    FW_SET.has(part) ? (
      <span className="fw-pill" key={`${kp}${i}`}>
        {part}
      </span>
    ) : (
      <React.Fragment key={`${kp}${i}`}>{part}</React.Fragment>
    )
  );
}

/** Render multi paragraph text with framework highlighting. */
export function RichText({ text, kp = "r" }) {
  return (
    <>
      {text.split("\n\n").map((p, i) => (
        <p key={`${kp}p${i}`}>{highlight(p, `${kp}${i}`)}</p>
      ))}
    </>
  );
}

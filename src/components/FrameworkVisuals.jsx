import React, { useState, useEffect, useRef } from "react";
import { SCARF_ALL, SCARF_COLORS, TKI_COLORS } from "../lib/frameworks.js";

// One plain-language sentence per lens: what it reads about the person and why it
// helps you move them. These are lenses on observable behavior and stated
// positions, never fixed traits about the person.
const FRAMEWORK_INFO = {
  scarf: "SCARF reads status, certainty, autonomy, relatedness, and fairness so you know what threatens or reassures them.",
  tki: "Thomas-Kilmann reads how they tend to handle conflict so you can choose the right pressure and pace.",
  cialdini: "Cialdini reads which influence lever is most likely to land so your ask reaches them the right way.",
  fisherUry: "The Fisher and Ury lens reads the interest under the position so you solve the real need, not only the stated ask.",
};

// What a specific Thomas-Kilmann conflict style means for how you approach them.
// Behavior to expect when pushed, not a fixed label on the person.
const TKI_ACTION = {
  Competing: "Competing style means expect them to push for their position, so come with leverage, not just rapport.",
  Collaborating: "Collaborating style means they look for a joint win, so bring them in to shape the solution.",
  Avoiding: "Avoiding style means they sidestep conflict, so lower the stakes and make it easy to agree.",
  Accommodating: "Accommodating style means they tend to yield, so confirm they really agree, not just defer.",
  Compromising: "Compromising style means they meet halfway, so open with room to trade.",
};

const SCARF_ACTION = {
  Status: "protect their standing",
  Certainty: "reduce surprise",
  Autonomy: "give them a real choice",
  Relatedness: "build trust first",
  Fairness: "show the process is even-handed",
};

const WHAT_ARE_THESE = [
  "Four lenses the room uses to suggest how to approach this person.",
  "They read observable behavior and stated positions, not fixed personality.",
  "Each points at a different way to move someone: what reassures them, how they handle conflict, which influence lever lands, and what they really want.",
];

function listPhrase(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function cialdiniMove(lever) {
  const key = lever.toLowerCase();
  if (key.includes("reciprocity")) return "offer a useful trade first";
  if (key.includes("authority")) return "bring credible proof or a respected source";
  if (key.includes("social proof") || key.includes("consensus")) return "show aligned peers";
  if (key.includes("consistency")) return "link the ask to a prior commitment";
  if (key.includes("liking")) return "use a trusted messenger";
  if (key.includes("scarcity")) return "make the cost of waiting concrete";
  if (key.includes("unity")) return "frame the move around shared identity";
  if (key.includes("status")) return "give them a face-saving win";
  return `use ${lever.toLowerCase()} deliberately`;
}

function scarfInfoFor(dims) {
  if (!dims.length) return FRAMEWORK_INFO.scarf;
  const moves = dims.map((d) => SCARF_ACTION[d]).filter(Boolean);
  if (!moves.length) return FRAMEWORK_INFO.scarf;
  return `SCARF ${listPhrase(dims)} calls for ${listPhrase(moves)} so the ask feels reassuring, not threatening.`;
}

function cialdiniInfoFor(levers) {
  if (!levers.length) return FRAMEWORK_INFO.cialdini;
  const moves = levers.map(cialdiniMove);
  return `Cialdini ${listPhrase(levers)} calls for ${listPhrase(moves)} so the ask fits the observed pattern.`;
}

function fisherUryInfoFor(teaser) {
  if (!teaser) return FRAMEWORK_INFO.fisherUry;
  return "The Fisher and Ury lens uses this position and interest read so you solve the underlying need before trading on the stated ask.";
}

function Row({ id, label, info, hasData, body, infoOpen, onToggleInfo, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`vfw ${hasData ? "" : "vfw-empty"}`}>
      <div className="vfw-row">
        <span className="vfw-label">{label}</span>
        <button
          type="button"
          className={`vfw-info ${infoOpen ? "vfw-info-on" : ""}`}
          aria-expanded={infoOpen}
          aria-label={`What ${label} tells you`}
          onClick={() => onToggleInfo(id)}
        >
          i
        </button>
        <button type="button" className="vfw-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="vfw-tag">{children}</span>
          <span className="vfw-chevron">{open ? "–" : "+"}</span>
        </button>
        {infoOpen && (
          <div className="vfw-pop" role="note">
            {info}
          </div>
        )}
      </div>
      {open && <p className="vfw-body">{body || info}</p>}
    </div>
  );
}

/**
 * Frameworks rendered visual first. All four are always present so the user can
 * see what is coming, even before there is a read. Each row keeps its value chip
 * and adds a tappable "i" that opens one plain-language sentence explaining what
 * the lens, and the current value, means for how you approach the person. A
 * single "What are these?" disclosure explains the set. Static copy only.
 */
export function FrameworkVisuals({ person }) {
  const [openInfo, setOpenInfo] = useState(null);
  const [showWhat, setShowWhat] = useState(false);
  const listRef = useRef(null);

  const toggleInfo = (id) => setOpenInfo((cur) => (cur === id ? null : id));

  // Persistent popover: dismiss on outside click or Escape, one open at a time.
  useEffect(() => {
    if (!openInfo) return;
    const onDown = (e) => {
      if (listRef.current && !listRef.current.contains(e.target)) setOpenInfo(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenInfo(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openInfo]);

  const read = person.baseRead || {};
  const tags = person.visualTags || {};
  const dims = tags.scarfDimensions || [];
  const hasTki = Boolean(tags.tkiStyle);
  const tkiColor = hasTki ? TKI_COLORS[tags.tkiStyle] || "var(--ink-faint)" : "var(--line-strong)";
  const levers = (tags.cialdiniLever || "").split("·").map((l) => l.trim()).filter(Boolean);
  const first = person.name.split(" ")[0];
  const hasAny = Boolean(read.scarf || read.tki || read.cialdini || read.fisherUry || dims.length || hasTki || levers.length || tags.fuTeaser);

  // The Thomas-Kilmann popover explains the mapped style for action when set.
  const scarfInfo = scarfInfoFor(dims);
  const tkiInfo = hasTki ? TKI_ACTION[tags.tkiStyle] || FRAMEWORK_INFO.tki : FRAMEWORK_INFO.tki;
  const cialdiniInfo = cialdiniInfoFor(levers);
  const fisherUryInfo = fisherUryInfoFor(tags.fuTeaser);

  return (
    <div className="vfw-list" ref={listRef}>
      <div className="fw-top">
        <button type="button" className="fw-whatlink" aria-expanded={showWhat} onClick={() => setShowWhat((v) => !v)}>
          What are these?
        </button>
      </div>
      {showWhat && (
        <div className="fw-what" role="note">
          {WHAT_ARE_THESE.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      {!hasAny && (
        <p className="fw-empty-top">
          No read yet. Add notes with <code>@note {first} ...</code> and I will map {first} across these frameworks as you learn how they operate.
        </p>
      )}

      <Row id="scarf" label="SCARF" info={scarfInfo} hasData={Boolean(read.scarf || dims.length)} body={read.scarf} infoOpen={openInfo === "scarf"} onToggleInfo={toggleInfo}>
        <span className="scarf-dims">
          {SCARF_ALL.map((d) => {
            const on = dims.includes(d);
            return (
              <span
                key={d}
                className={`scarf-pill ${on ? "scarf-on" : "scarf-off"}`}
                style={on ? { background: SCARF_COLORS[d], color: "#fff" } : undefined}
                title={d}
              >
                {d[0]}
              </span>
            );
          })}
        </span>
      </Row>

      <Row id="tki" label="Thomas-Kilmann" info={tkiInfo} hasData={Boolean(read.tki || hasTki)} body={read.tki} infoOpen={openInfo === "tki"} onToggleInfo={toggleInfo}>
        <span className={`tki-badge ${hasTki ? "" : "tki-empty"}`} style={{ background: tkiColor }}>
          {tags.tkiStyle || "Not mapped"}
        </span>
      </Row>

      <Row id="cialdini" label="Cialdini" info={cialdiniInfo} hasData={Boolean(read.cialdini || levers.length)} body={read.cialdini} infoOpen={openInfo === "cialdini"} onToggleInfo={toggleInfo}>
        <span className="cialdini-chips">
          {levers.length ? (
            levers.map((l) => (
              <span key={l} className="cialdini-chip">
                {l}
              </span>
            ))
          ) : (
            <span className="cialdini-chip cialdini-empty">Not mapped</span>
          )}
        </span>
      </Row>

      <Row id="fisherUry" label="Fisher & Ury" info={fisherUryInfo} hasData={Boolean(read.fisherUry || tags.fuTeaser)} body={read.fisherUry} infoOpen={openInfo === "fisherUry"} onToggleInfo={toggleInfo}>
        <span className={`fu-teaser ${tags.fuTeaser ? "" : "fu-empty"}`}>{tags.fuTeaser || "Not mapped"}</span>
      </Row>
    </div>
  );
}

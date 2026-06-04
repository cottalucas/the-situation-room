import React, { useState } from "react";
import { SCARF_ALL, SCARF_COLORS, TKI_COLORS } from "../lib/frameworks.js";

// Concise "what it is + how to use it" for each lens, shown on the info tooltip
// and when an empty framework is expanded.
// Very short "what it is, how to read it" per lens. Shown in the hover tooltip
// and when an empty framework is expanded.
const FRAMEWORK_INFO = {
  scarf: "What feels safe or threatening to them, across Status, Certainty, Autonomy, Relatedness, Fairness. Read which one is at stake.",
  tki: "Their default conflict style. Read how they push or yield under pressure.",
  cialdini: "Which influence levers move them. Read which one to lead with.",
  fisherUry: "Their stated position versus their real interest. Read what they actually need.",
};

function Row({ label, info, hasData, children, body }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`vfw ${open ? "vfw-open" : ""} ${hasData ? "" : "vfw-empty"}`}>
      <button className="vfw-head" onClick={() => setOpen((v) => !v)}>
        <span className="vfw-label">
          {label}
          <span className="vfw-info" tabIndex={0} aria-label={info} onClick={(e) => e.stopPropagation()}>
            i
            <span className="vfw-tip" role="tooltip">
              {info}
            </span>
          </span>
        </span>
        <span className="vfw-tag">{children}</span>
        <span className="vfw-chevron">{open ? "–" : "+"}</span>
      </button>
      {open && <p className="vfw-body">{body || info}</p>}
    </div>
  );
}

/**
 * Frameworks rendered visual first. All four are always present so the user can
 * see what is coming, even before there is a read. Each row has an info tooltip,
 * and an empty framework shows a muted "not mapped" state plus guidance on expand.
 */
export function FrameworkVisuals({ person }) {
  const read = person.baseRead || {};
  const tags = person.visualTags || {};
  const dims = tags.scarfDimensions || [];
  const hasTki = Boolean(tags.tkiStyle);
  const tkiColor = hasTki ? TKI_COLORS[tags.tkiStyle] || "var(--ink-faint)" : "var(--line-strong)";
  const levers = (tags.cialdiniLever || "").split("·").map((l) => l.trim()).filter(Boolean);
  const first = person.name.split(" ")[0];
  const hasAny = Boolean(read.scarf || read.tki || read.cialdini || read.fisherUry || dims.length || hasTki || levers.length || tags.fuTeaser);

  return (
    <div className="vfw-list">
      {!hasAny && (
        <p className="fw-empty-top">
          No read yet. Add notes with <code>@note {first} ...</code> and I will map {first} across these frameworks as you learn how they operate.
        </p>
      )}

      <Row label="SCARF" info={FRAMEWORK_INFO.scarf} hasData={Boolean(read.scarf || dims.length)} body={read.scarf}>
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

      <Row label="Thomas-Kilmann" info={FRAMEWORK_INFO.tki} hasData={Boolean(read.tki || hasTki)} body={read.tki}>
        <span className={`tki-badge ${hasTki ? "" : "tki-empty"}`} style={{ background: tkiColor }}>
          {tags.tkiStyle || "Not mapped"}
        </span>
      </Row>

      <Row label="Cialdini" info={FRAMEWORK_INFO.cialdini} hasData={Boolean(read.cialdini || levers.length)} body={read.cialdini}>
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

      <Row label="Fisher & Ury" info={FRAMEWORK_INFO.fisherUry} hasData={Boolean(read.fisherUry || tags.fuTeaser)} body={read.fisherUry}>
        <span className={`fu-teaser ${tags.fuTeaser ? "" : "fu-empty"}`}>{tags.fuTeaser || "Not mapped"}</span>
      </Row>
    </div>
  );
}

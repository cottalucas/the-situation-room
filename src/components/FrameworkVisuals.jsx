import React, { useState } from "react";
import { SCARF_ALL, SCARF_COLORS, TKI_COLORS } from "../lib/frameworks.js";

function Row({ label, children, body }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`vfw ${open ? "vfw-open" : ""}`}>
      <button className="vfw-head" onClick={() => setOpen((v) => !v)}>
        <span className="vfw-label">{label}</span>
        <span className="vfw-tag">{children}</span>
        <span className="vfw-chevron">{open ? "–" : "+"}</span>
      </button>
      {open && <p className="vfw-body">{body}</p>}
    </div>
  );
}

/**
 * Frameworks rendered visual first. Each row shows a color coded summary and
 * expands to the full read on click. A fresh person shows a light state.
 */
export function FrameworkVisuals({ person }) {
  if (person.fresh) {
    return (
      <div className="fw-fresh">
        <p>First pass read. Sharpen it with notes as you learn how they operate.</p>
        <code className="cmd-hint">@note {person.name.split(" ")[0]} ...</code>
      </div>
    );
  }

  const read = person.baseRead || {};
  const tags = person.visualTags || {};
  const dims = tags.scarfDimensions || [];
  const tkiColor = TKI_COLORS[tags.tkiStyle] || "#8d8a82";

  return (
    <div className="vfw-list">
      <Row label="SCARF" body={read.scarf}>
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

      <Row label="Thomas-Kilmann" body={read.tki}>
        <span className="tki-badge" style={{ background: tkiColor }}>
          {tags.tkiStyle || "Unknown"}
        </span>
      </Row>

      <Row label="Cialdini" body={read.cialdini}>
        <span className="cialdini-chips">
          {(tags.cialdiniLever || "").split("·").map((l) => (
            <span key={l} className="cialdini-chip">
              {l.trim()}
            </span>
          ))}
        </span>
      </Row>

      <Row label="Fisher & Ury" body={read.fisherUry}>
        <span className="fu-teaser">{tags.fuTeaser}</span>
      </Row>
    </div>
  );
}

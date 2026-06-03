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
        <code className="cmd-hint">@notes {person.name.split(" ")[0]} ...</code>
      </div>
    );
  }

  const dims = person.scarfDimensions || [];
  const tkiColor = TKI_COLORS[person.tkiStyle] || "#8d8a82";

  return (
    <div className="vfw-list">
      <Row label="SCARF" body={person.scarf}>
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

      <Row label="Thomas-Kilmann" body={person.tki}>
        <span className="tki-badge" style={{ background: tkiColor }}>
          {person.tkiStyle || "Unknown"}
        </span>
      </Row>

      <Row label="Cialdini" body={person.cialdini}>
        <span className="cialdini-chips">
          {(person.cialdiniLever || "").split("·").map((l) => (
            <span key={l} className="cialdini-chip">
              {l.trim()}
            </span>
          ))}
        </span>
      </Row>

      <Row label="Fisher & Ury" body={person.fisherUry}>
        <span className="fu-teaser">{person.fuTeaser}</span>
      </Row>
    </div>
  );
}

import React, { useState } from "react";
import { OverflowMenu } from "./OverflowMenu.jsx";

const DECISION_LIMIT = 4;

function decisionTime(decision) {
  const value = decision.createdAt;
  if (value?.toMillis) return value.toMillis();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const idTime = String(decision.id || "").match(/-(\d{13})-/)?.[1];
  return idTime ? Number(idTime) : 0;
}

/**
 * Navigation rail. Rooms are top level with a single quiet selected treatment (a
 * left accent rule, no card). Decisions nest as plain indented rows with a status
 * dot. One shared "+ add" affordance for new decision and new room. When a room
 * has more than four decisions, the list shows the most recent four with a quiet
 * inline "Show all (N)" / "Show less" toggle; the active decision always stays
 * visible. Sign out lives in the account menu, not here.
 */
export function Rail({
  rooms,
  activeRoomId,
  activeDecisionId,
  collapsed,
  onToggleCollapse,
  onSelectRoom,
  onNewRoom,
  onEditRoom,
  onDeleteRoom,
  decisions,
  onSelectDecision,
  onNewDecision,
  onEditDecision,
  onArchiveDecision,
  onDeleteDecision,
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const byTime = (a, b) => decisionTime(a) - decisionTime(b);
  const active = decisions.filter((d) => d.status === "active").sort(byTime);
  const archived = decisions.filter((d) => d.status === "archived").sort(byTime);

  // Show the most recent four (array order is creation order). When collapsed,
  // keep the active decision visible even if it falls outside that window.
  const overflow = active.length > DECISION_LIMIT;
  let visibleDecisions = active;
  if (overflow && !showAll) {
    visibleDecisions = active.slice(active.length - DECISION_LIMIT);
    if (activeDecisionId && !visibleDecisions.some((d) => d.id === activeDecisionId)) {
      const selected = active.find((d) => d.id === activeDecisionId);
      if (selected) visibleDecisions = [selected, ...visibleDecisions];
    }
  }

  const decisionRow = (d, archivedRow = false) => (
    <div key={d.id} className={`rail-row deci-row ${d.id === activeDecisionId ? "rail-row-active" : ""}`}>
      <button className={`deci-item ${archivedRow ? "deci-item-archived" : ""}`} onClick={() => onSelectDecision(d.id)}>
        <span className={`deci-dot ${archivedRow ? "" : "deci-dot-active"}`} />
        <span className="deci-name">{d.title}</span>
      </button>
      <OverflowMenu
        items={[
          { label: "Edit", onClick: () => onEditDecision(d.id) },
          ...(archivedRow ? [] : [{ label: "Archive", onClick: () => onArchiveDecision(d.id) }]),
          { label: "Delete", danger: true, onClick: () => onDeleteDecision(d.id) },
        ]}
      />
    </div>
  );

  const expandedRail = (className = "rail") => (
    <nav className={className}>
      <div className="rail-top">
        <span className="rail-head-title">Rooms</span>
        {onToggleCollapse && (
          <button className="rail-collapse" onClick={onToggleCollapse} title="Collapse navigation">
            ‹
          </button>
        )}
      </div>

      {rooms.map((r) => {
        const isActive = r.id === activeRoomId;
        return (
          <div key={r.id} className="room-block">
            <div className={`rail-row ${isActive ? "rail-row-active" : ""}`}>
              <button className="rail-item" onClick={() => onSelectRoom(r.id)}>
                <span className="rail-name">{r.name}</span>
                <span className="rail-meta">{r.rosterIds?.length || 0} people</span>
              </button>
              <OverflowMenu
                items={[
                  { label: "Edit", onClick: () => onEditRoom(r.id) },
                  { label: "Delete", danger: true, onClick: () => onDeleteRoom(r.id) },
                ]}
              />
            </div>

            {isActive && (
              <div className="decisions-nest">
                <span className="nest-label">Decisions</span>

                {visibleDecisions.map((d) => decisionRow(d))}
                {active.length === 0 && <p className="rail-empty">No active decisions yet.</p>}

                {overflow && (
                  <button className="rail-showall" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Show less" : `Show all (${active.length})`}
                  </button>
                )}

                <button className="rail-add-btn" onClick={onNewDecision}>
                  + New decision
                </button>

                {archived.length > 0 && (
                  <div className="archive-nest">
                    <button className="archive-head" onClick={() => setArchiveOpen((v) => !v)}>
                      <span className="rail-chevron">{archiveOpen ? "▾" : "▸"}</span>
                      Archived
                    </button>
                    {archiveOpen && archived.map((d) => decisionRow(d, true))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button className="rail-add-btn rail-add-room" onClick={onNewRoom}>
        + New room
      </button>
    </nav>
  );

  if (collapsed) {
    return (
      <>
        <nav className="rail rail-collapsed rail-desktop-only">
          <button className="rail-expand" onClick={onToggleCollapse} title="Expand navigation">
            ›
          </button>
        </nav>
        {expandedRail("rail rail-mobile-forced")}
      </>
    );
  }

  return expandedRail();
}

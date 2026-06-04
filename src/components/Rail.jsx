import React, { useState } from "react";
import { OverflowMenu } from "./OverflowMenu.jsx";

/**
 * Navigation rail. Rooms are top level. Decisions nest under the selected room,
 * indented. Archived is a collapsed subsection within decisions. Edit and delete
 * live in a hover overflow menu, not a persistent gear. The whole rail collapses.
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

  const active = decisions.filter((d) => d.status === "active");
  const archived = decisions.filter((d) => d.status === "archived");

  const expandedRail = (className = "rail") => (
    <nav className={className}>
      <div className="rail-top">
        <span className="rail-head-title">Rooms</span>
        <button className="rail-collapse" onClick={onToggleCollapse} title="Collapse navigation">
          ‹
        </button>
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

                {active.map((d) => (
                  <div
                    key={d.id}
                    className={`rail-row deci-row ${d.id === activeDecisionId ? "rail-row-active" : ""}`}
                  >
                    <button className="deci-item" onClick={() => onSelectDecision(d.id)}>
                      <span className="deci-dot deci-dot-active" />
                      <span className="deci-name">{d.title}</span>
                    </button>
                    <OverflowMenu
                      items={[
                        { label: "Edit", onClick: () => onEditDecision(d.id) },
                        { label: "Archive", onClick: () => onArchiveDecision(d.id) },
                        { label: "Delete", danger: true, onClick: () => onDeleteDecision(d.id) },
                      ]}
                    />
                  </div>
                ))}
                {active.length === 0 && <p className="rail-empty">No active decisions yet.</p>}

                <button className="add-pill" onClick={onNewDecision}>
                  + New decision
                </button>

                {archived.length > 0 && (
                  <div className="archive-nest">
                    <button className="archive-head" onClick={() => setArchiveOpen((v) => !v)}>
                      <span className="rail-chevron">{archiveOpen ? "▾" : "▸"}</span>
                      Archived
                    </button>
                    {archiveOpen &&
                      archived.map((d) => (
                        <div
                          key={d.id}
                          className={`rail-row deci-row ${d.id === activeDecisionId ? "rail-row-active" : ""}`}
                        >
                          <button className="deci-item deci-item-archived" onClick={() => onSelectDecision(d.id)}>
                            <span className="deci-dot" />
                            <span className="deci-name">{d.title}</span>
                          </button>
                          <OverflowMenu
                            items={[
                              { label: "Edit", onClick: () => onEditDecision(d.id) },
                              { label: "Delete", danger: true, onClick: () => onDeleteDecision(d.id) },
                            ]}
                          />
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button className="add-pill add-pill-room" onClick={onNewRoom}>
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

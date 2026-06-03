import React, { useState } from "react";
import { Modal } from "./Modal.jsx";
import { Avatar } from "../primitives.jsx";

/**
 * Manage the room: name and the persistent roster. Roster members are
 * available to every decision in the room.
 */
export function RoomSettings({ room, allPeople, onClose, onRename, onAddToRoster, onRemoveFromRoster }) {
  const [name, setName] = useState(room.name);
  const roster = room.rosterIds.map((id) => allPeople[id]).filter(Boolean);
  const available = Object.values(allPeople).filter((p) => !room.rosterIds.includes(p.id));

  return (
    <Modal title="Room settings" wide onClose={onClose}>
      <div className="field">
        <label className="field-label">Room name</label>
        <div className="field-row">
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary btn-sm" onClick={() => onRename(name)}>
            Save
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Roster</label>
        <p className="field-help">Persistent team members. Available to every decision in this room.</p>
        <ul className="roster-list">
          {roster.map((p) => (
            <li key={p.id} className="roster-row">
              <Avatar name={p.name} size="sm" />
              <div className="roster-info">
                <span className="roster-name">{p.name}</span>
                <span className="roster-role">{p.role}</span>
              </div>
              <button className="btn-ghost btn-sm" onClick={() => onRemoveFromRoster(p.id)}>
                Remove
              </button>
            </li>
          ))}
          {roster.length === 0 && <p className="muted-text">No one added yet.</p>}
        </ul>
      </div>

      {available.length > 0 && (
        <div className="field">
          <label className="field-label">Add from directory</label>
          {available.map((p) => (
            <button key={p.id} className="add-row" onClick={() => onAddToRoster(p.id)}>
              <Avatar name={p.name} size="sm" />
              <div className="roster-info">
                <span className="roster-name">{p.name}</span>
                <span className="roster-role">{p.role}</span>
              </div>
              <span className="add-icon">+</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

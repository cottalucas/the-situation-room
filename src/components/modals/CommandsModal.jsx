import React from "react";
import { Modal } from "./Modal.jsx";

const COMMANDS = [
  { cmd: "@note <name> <text>", desc: "Rewrite the note, save it, and update the person's read when there is enough signal." },
  { cmd: "@grid <text>", desc: "Read power, interest, and stance from plain language, then update the grid." },
  { cmd: "@network <text>", desc: "Read reporting, control, alliance, conflict, and influence, then update the network." },
  { cmd: "@map <text>", desc: "Read people, notes, grid, and network from a longer situation." },
  { cmd: "@create <text>", desc: "Create people from a longer description, then add them to this decision." },
  { cmd: "@add <name>, <role>", desc: "Add someone external to this decision only." },
];

/** Reference for the chat commands. Same design as the other modals. */
export function CommandsModal({ onClose }) {
  return (
    <Modal title="Commands" sub="Type these in the chat." onClose={onClose}>
      <ul className="commands-list">
        {COMMANDS.map((c) => (
          <li key={c.cmd} className="command-row">
            <code className="command-code">{c.cmd}</code>
            <span className="command-desc">{c.desc}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

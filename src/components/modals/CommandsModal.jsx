import React from "react";
import { Modal } from "./Modal.jsx";

const COMMANDS = [
  { cmd: "@notes <name> <text>", desc: "Attach a private note to a participant. It shows on their profile." },
  { cmd: "@add <name>, <role>", desc: "Add someone external to this decision only." },
  { cmd: "<any situation>", desc: "Ask a question and get a grounded, sequenced play." },
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

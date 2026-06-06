import React from "react";
import { Modal } from "./Modal.jsx";

// Two clear jobs: build the map, then read it. Each command has one purpose.
const GROUPS = [
  {
    title: "Build the room",
    items: [
      { cmd: "@energy <text>", desc: "Place people by power and interest, and set where they stand. Example: “@energy the CEO has high power but low interest.”" },
      { cmd: "@network <text>", desc: "Map who reports to, allies with, or clashes with whom. Example: “@network sales reports to the CEO and clashes with product.”" },
      { cmd: "@note <person> <text>", desc: "Save one observation about a person and sharpen their read. The person can be a name, first name, or role. Example: “@note head of sales keeps asking for updates.”" },
      { cmd: "@map <text>", desc: "Describe the whole situation in prose and let it route to people, notes, energy, and network at once. The broad intake command." },
      { cmd: "@create <text>", desc: "Only add people by name and role, without analyzing them yet." },
      { cmd: "@add <name>, <role>", desc: "Add one outside person to this decision only." },
    ],
  },
  {
    title: "Read the room",
    items: [
      { cmd: "@play", desc: "Generate the strategic play: who to engage first, the lever per person, and the key risk. It runs only when the room is ready, with you plus at least one other person, every stance set, and the others placed on Energy. Otherwise it coaches you to close the gap. The play pins as a card." },
      { cmd: "@read", desc: "Get the strategist’s read of the whole room only when you ask for it: what you are missing and who to move first. The result appears in the chat." },
      { cmd: "@ask <question>", desc: "Ask the strategist one question about this room, like who to talk to first or where the risk is. It cites the people it reasons from." },
    ],
  },
];

/** Reference for the chat commands, grouped by purpose. */
export function CommandsModal({ onClose }) {
  return (
    <Modal title="Commands" sub="Type these in the chat. Each one has a single job." onClose={onClose}>
      {GROUPS.map((group) => (
        <div key={group.title} className="command-group">
          <p className="command-group-title">{group.title}</p>
          <ul className="commands-list">
            {group.items.map((c) => (
              <li key={c.cmd} className="command-row">
                <code className="command-code">{c.cmd}</code>
                <span className="command-desc">{c.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Modal>
  );
}

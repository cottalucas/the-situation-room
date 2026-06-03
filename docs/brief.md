# Brief: The Situation Room

Source of truth for what we are building and why. Revise freely.

## Stage
Working prototype with Firebase Auth and Firestore behind the store interface.
The encrypted local cache remains for fast load and session consistency.
Claude chat is command-first through local Vite testing or an authenticated
Firebase Function. `@note`, `@grid`, `@network`, and `@map` are the active
surface while open play chat stays parked until mapping, trace capture, and
evals are stronger. Next step is the privacy surface for export, delete, and
clear data location.

## Problem
The tools a product or corporate operator has help with the artifact, not the
politics. There are tools for docs, specs, tickets, and roadmaps. Nothing helps
you read the people behind a decision and plan how to move them. The hard part
of shipping is rarely the work. It is the room.

## User
Product managers and corporate operators who have to get a decision through a
group of people with different power, interest, and incentives. They already
think this way. They lack a place to map it and a sharp second opinion.

## Scope
- Rooms (a standing group with a roster) that hold Decisions.
- Decisions pull participants from the roster and may add externals.
- Three lenses per decision: People (who you are dealing with), Energy (who to
  spend energy on, the Mendelow power/interest map), Network (who moves whom).
- A command-first chat that updates notes, grid, and network from prose. Open
  play coaching comes back after the command layer is reliable.
- Person profiles that compound across decisions: read, goal, notes, history.

## Success signal
A user maps a real decision they are facing and gets a play they would actually
act on. They come back for the next decision because the room remembers the
people.

## Constraints
- Privacy and GDPR. The data is notes about real colleagues. It must feel
  private by default, exportable, and deletable. Be explicit about where data
  lives.
- The AI output must be sharp and specific to the people and the goal. Generic
  advice kills trust on the first try.
- Three lenses only. No personality test. The frameworks do the situational
  read; a trait quiz about colleagues is low signal and a privacy liability.

# Brief: The Situation Room

Source of truth for what we are building and why. Revise freely.

## Stage
Working prototype. Local state only, no backend yet. Next step is a real
foundation on Firebase (Auth and Firestore) plus the Claude API for reasoning.

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
- Three lenses per decision: People (who you are dealing with), Grid (who to
  spend energy on), Network (who moves whom).
- A chat that returns a grounded, sequenced play for a situation.
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

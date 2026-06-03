# Roadmap

## Built (prototype)
- Landing page and routing into the app.
- Rooms with a persistent roster. One seeded room.
- Decisions inside a room, with context, deadline, archive.
- Three lenses: People, Grid (draggable), Network (typed edges, sequence path).
- Floating person profile, compact from grid and network, full from People.
- Visual first frameworks (SCARF, Thomas Kilmann, Cialdini, Fisher and Ury).
- Chat that returns a canned, grounded play, plus `@notes` and `@add` commands.
- Global person memory: notes and cross decision history.
- Data access layer shaped for Firebase. Clean folder structure. Docs.

## Next
- Firebase Auth. Gate the room view, keep landing public.
- Firestore behind the store interface. Real persistence, per user data.
- Claude API for the reasoning engine, replacing the canned play. Pass the
  decision context, participants, framework reads, and notes.
- Prose to map onboarding. Describe the team in plain language, watch it become
  a populated map. Hook lives at the new room flow in `views/Room.jsx`.
- Privacy surface: export, delete, and a clear statement of where data lives.
- Editable network edges and per person edge drawing.

## Out of scope
- No personality or trait quiz about colleagues. Low signal, privacy risk.
- No fourth lens. People, Grid, and Network are the full set.
- No real keys or backend committed until the privacy model is decided.

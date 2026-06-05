# Roadmap

## Built (prototype)
- Landing page and routing into the app.
- Firebase Auth gate. Landing is public, the room view requires auth when
  Firebase env vars are configured.
- Email and password registration, email and password sign in, Google sign in,
  and logout.
- Firestore backed rooms, people, decisions, observations, edges, and generated
  plays. Local preview requires `VITE_ENABLE_LOCAL_PREVIEW=true`.
- Firebase Analytics for screen views and privacy-safe product events.
- Firebase Hosting configured for the `dist/` production build.
- Encrypted IndexedDB cache for fast load and session consistency.
- Client side AES-GCM encryption for personal free text before Firestore writes.
- Firestore security rules scoped by user owner or parent room owner.
- Rooms with a persistent roster. Firebase accounts start empty; explicit local
  preview keeps one seeded room.
- Delete flows for rooms and decisions, plus person roster removal with
  `delete` confirmation.
- Decisions inside a room, with context, deadline, archive, positions, and
  placements.
- Three lenses: People, Energy (the draggable power/interest map, command
  @energy with @grid as a hidden alias), Network (typed edges, sequence path).
- Desktop rail cleanup. Rooms and Decisions stay in the rail, selected rows use
  one quiet treatment, decision rows are plain and indented, New room and New
  decision share the same plus affordance, and rooms with many active decisions
  collapse to the recent four with inline Show all and Show less controls that
  never hide the active decision.
- Mobile shell: slim header with a right-side burger drawer (rooms, decisions,
  account menu), a top tab row as the primary lens switcher (People, Energy,
  Network), full-screen graph, no bottom bar, and a command companion replacing
  chat-as-a-tab. The companion opens as a full-screen mobile command view; its
  graph-lens entry compresses to a slash button beside the header actions so it
  does not cover the map. Mobile person, notes, and framework route pages keep
  the app header plus a separate back row. Desktop keeps the rail plus
  chat-column three-pane layout. The chat input autofocuses on desktop only; on
  mobile it focuses on tap so the keyboard never opens the product out of view on
  load. Last room and decision persist to the user in Firestore and restore on
  reload; rooms-but-none-selected shows a "Select your room" overlay, and no
  rooms routes into guided setup.
- Account menu on web and mobile. It shows Signed in as, Profile, Frameworks,
  and Sign out in the same order. The shared Profile modal persists name and a
  fixed optional position select under the signed-in user document, keeps email
  read-only, allows empty fields, and uses the saved name in the greeting when
  present.
- Single person profile route plus framework reference. `#/person/:id` combines
  driver, recent encrypted notes, history, and mapped framework state with visual
  chips; `#/person/:id/notes` holds the long encrypted notes list; `#/frameworks`
  is generic framework reference with no person data. Tapping a graph node shows
  a floating node summary that opens the person profile page.
- Visual first frameworks (SCARF, Thomas Kilmann, Cialdini, Fisher and Ury),
  rendered as state-label chips on the person and explained generically on the
  shared /frameworks page.
- Command-first chat. Send is enabled only for `@` commands while open play
  coaching is parked. Sent prompts appear in the thread as user bubbles before
  structured assistant results.
- Local-only Claude connection test bridge behind `VITE_ENABLE_LIVE_LLM=true`.
  It uses Vite dev server endpoints, keeps the Anthropic key server-side,
  validates returned JSON, and falls back safely.
- Local LLM trace capture in ignored `llm-traces/`, including raw prompts,
  raw responses, parsed JSON, validation status, latency, usage, and estimated
  cost for trace analysis.
- Production Claude API backend in Firebase Functions. The browser calls
  same-origin `/api/**`, the function verifies Firebase Auth, reads the
  Anthropic key from a Firebase secret, enforces per-user daily request and
  cost limits, logs usage, and stores trace metadata under the user.
- LLM-backed local chat commands for testing: `@note`, `@grid`, `@network`,
  `@map`, and `@create`. They interpret plain language into concise notes,
  optional framework reads, grid placement, stance, network edges, and open
  questions. Extreme grid changes are held for clarification instead of applied
  blindly.
- Deterministic real-room network layout. Seed coordinates are only used for
  the full seeded preview; Firebase rooms spread people from role hierarchy and
  edge structure. Grid placement does not reshuffle the network. Command
  application also resolves role references such as CEO and CPO to existing
  people before creating new records.
- V1 offline eval harness with synthetic fixtures for play focus, note rewrite,
  framework updates, grid mapping, network mapping, implicit reporting and
  control edges, role-resolution regressions, ethical influence, and trace
  output. Offline evals do not call Claude.
- Persistent chat per decision in Firestore with a last 8 turn context window for
  anaphora, encrypted free text, under the signed-in owner.
- Grounded strategist (@ask): a calm stakeholder coach that reasons only over the
  room, cites the people it uses, declines off-topic requests, and never
  diagnoses or assigns traits. Haiku only, additive to the commands. First-class
  prompt chips, and "The Read": a grounded read of the room rendered inside the
  chat only when the user sends `@read`. It persists as a chat message. Selecting
  or restoring a room or decision never triggers it; below threshold it returns
  basic insights and asks for more information with no model call.
- Global person memory: observations and cross decision history.
- Guided Setup, one engine behind three doors (first-run, "+ New room", and
  manual). A warm three-question conversation (decision and outcome, make-or-break
  people, relationships) reflects back the user's own words between answers,
  shows one short naming confirm with a derived title, and builds the room through
  the existing @create, @energy, and @network command pipeline. First-run opens
  by default with the rooms rail collapsed and never shows to a user who already
  has real content; "Skip, I'll set it up myself" drops into the manual Room
  Settings modal. Building force-creates every extracted person (never "No
  participants") while apply-time resolution dedupes role mentions, and the
  closing names what it built specifically.
- LLM context helper for Claude command and play calls.
- GitHub CI check for the app build, offline eval harness, and Firebase
  Function syntax check.
- Clean folder structure. Docs.

## Next
- Open (non-deterministic) chat is in experimental testing: plain text routes to
  the grounded strategist behind a deterministic input guard (jailbreak / abuse /
  oversized blocked pre-call) and the strategist-v2 harness (off-topic and
  roleplay refusal, profanity neutralized). Harden further from real test logs
  before making it the default surface.
- Live eval runs and model comparisons once the local prompt and command
  contract feel stable enough to spend credits deliberately.
- Production trace review workflow. Surface privacy-safe trace metadata in the
  app or export selected consented traces to Braintrust for scoring and
  dashboards.
- Stronger `@map` and `@network` extraction. Explicit reporting lines,
  micromanagement, control, alliances, conflict, close ties, and privileged
  relationships should become reliable enough to pass live trace-derived evals.
- Re-open plain chat only after command mapping, trace capture, and eval scores
  are good enough to prevent vague, expensive coaching responses.
- Privacy surface: export, delete, and a clear statement of where data lives.
- Stronger zero knowledge encryption option based on a user held secret, if the
  product needs protection from server side key derivation.
- Editable network edges and per person edge drawing.
- A safer relationship editing surface. The network canvas should not delete
  edges through accidental line clicks.
- Bundle splitting for Firebase modules if the production bundle warning starts
  to matter.
- Bump the Firebase Functions runtime off the deprecated Node 20 (decommission
  2026-10-31) before the deadline.

## Out of scope
- No personality or trait quiz about colleagues. Low signal, privacy risk.
- No fourth lens. People, Grid, and Network are the full set.
- No real keys or backend secrets committed. Firebase web config goes in
  `.env.local`, which is ignored.

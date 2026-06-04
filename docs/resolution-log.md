# Resolution log

Project memory. Append a dated entry per task. Newest at the top. Do not delete
entries; correct them with a follow up that references the original.

---

## 2026-06-04 - Pass 2 Phase A: persistence + anaphora verified

Verified the prior pass's persistent chat, context window, and `@ask` before
building on them. Extracted the pure reference resolver from `Room.jsx` into
`src/lib/person-ref.js` (`resolvePersonRef`) so anaphora is unit-testable; no
behavior change. Added `scripts/verify-phase-a.mjs` (`npm run verify:persistence`)
which drives the real `crypto.js`, the real `firestore-repo` message converters,
the snapshot sort, the resolver, and `compactRoomCommandContext`: 24/24 pass.
Result: free text encrypts and decrypts back, the thread rehydrates in order,
"Maya"/ids resolve to the existing person (no duplicate), a bare pronoun does not
resolve in the write layer (the model must bind it via recentTurns, which carry
the prior turn), and the room snapshot holds the people needed.

Transport-level proof (`tests/emulator/persistence.emulator.test.mjs`,
`npm run verify:emulator`, firebase.json emulators block) is written but BLOCKED
in this environment: the Firestore emulator needs Java, which is not installed
(`java -version` exits 1). Runnable where Java is present. No bugs found; the only
gap was that it was untested, now closed at the logic level. Details in
`AUDIT_REPORT_2.md`.

## 2026-06-03 - Overnight audit Phase 8: evals and observability

Confirmed offline evals are the default no-credit check and now cover every
command plus the strategist (15 cases, all passing); added a `@create` fixture and
an `eval` script alias. Confirmed the trace posture has not drifted: local raw
traces for debugging, production metadata + usage only with raw off by default.
Enhanced `trace:summary` with per-command input/output tokens and a budget block
(spent, remaining, percent) against a configurable $50 ceiling. Added a root
`README.md` with the one-line eval runner, live-eval gate, spend command, privacy
posture, and deploy steps. Wrote the executive summary at the top of
`AUDIT_REPORT.md`. This closes the overnight full-project pass.

## 2026-06-03 - Overnight audit Phase 7: grounded strategist

Added `@ask` (alias `@coach`), a grounded stakeholder coach on `/api/strategist`.
It reasons only over the room snapshot and recentTurns, returns
`{ answer, moves, cites, grounded }`, and `normalizeStrategistAnswer` drops any
cite not in the room so it cannot reference invented people. The prompt forbids
diagnosis and traits and declines off-topic requests with grounded false. Haiku
only, 900 token cap, existing daily budget guard. Additive: deterministic
commands unchanged. Endpoint mirrored in the Function and the Vite bridge; chat
renders a Strategist card with cited names. Eval harness gained scoreStrategist, a
banned trait/diagnosis vocabulary list, and grounded/decline checks; two strategist
fixtures added. Offline suite 14/14. Strategist prompt version
`strategist-v1-2026-06-03`.

## 2026-06-03 - Overnight audit Phase 6: persistent context-aware chat

Chat now persists to `rooms/{roomId}/decisions/{decId}/messages` under the owning
room, with free text (body, text, questions) encrypted and structure plaintext.
Only meaningful turns persist (user, updated, note, added, fallback); welcome,
loading, and parked play cards stay transient. The store seeds chat from this
history on load, so the conversation survives reload and another device. Messages
delete with the decision and room. Rule added for the messages subcollection.

Context window: `compactRoomCommandContext` attaches `recentTurns` (last 8 turns,
240 chars each) plus the room snapshot, and the command system prompt resolves
pronouns and follow-ups against them and the roster, never inventing a person.
Anaphora on Haiku, no bigger model. Prompt version bumped to
`room-command-v3-context-2026-06-03` in both src and functions. Grounding holds:
only @ commands run. Build clean, evals 12/12, function syntax OK.

## 2026-06-03 - Overnight audit Phase 5: Grid lens renamed to Energy

Renamed the user-facing lens and command from Grid to Energy / @energy. `@grid`
stays as a hidden alias and both route to the internal `grid` command and the
unchanged `decision.placements` / `positions` fields, so no migration. Updated
the tab label, chat placeholder, hint, prompt chip, commands modal, the fallback
message, and the brief/roadmap/architecture docs. The tab id, GridTab component,
store functions, and schema were intentionally left as `grid`. Rename map in
`AUDIT_REPORT.md`.

## 2026-06-03 - Overnight audit Phase 4: rendering verified, no mismatch

Verified stored values against the rendered output in code and CSS. Grid: power
plots to Y (high at top via bottom%), interest to X (high at right via left%),
and the 2x2 row-major quadrant DOM order maps correctly to Mendelow (Keep
satisfied top-left, Manage closely top-right, Monitor bottom-left, Keep informed
bottom-right). Stance dots match the position tokens, unknown is a dashed ring.
Network: ally green, conflict red, defers grey, arrowhead only on defers pointing
at the influencer, orphans render, self-loops unreachable. No store-vs-render
mismatch, no code change. Verification table in `AUDIT_REPORT.md`.

## 2026-06-03 - Overnight audit Phase 3: @map reuses the hardened path

Confirmed `@map` and `@create` are not a separate or looser code path: they share
`interpretRoomCommand`, the single command system prompt, `normalizeRoomUpdate`,
and `applyRoomUpdate` with `@grid` and `@network`, so all Phase 2 calibration,
confidence, and validation applies automatically. Tightened the map/create
command rules in both `src/` and `functions/` to say so explicitly (bands,
confidence, single-statement edge discipline, per-destination confirmation).
Added the `command-map-calibrated-mixed` offline fixture; suite now 12/12.

## 2026-06-03 - Overnight audit Phase 2: calibrated interpretation

Fixed the main pain: the model over-committed to extreme grid values and
over-inferred network edges. The `@grid` prompt now maps qualitative language to
explicit bands (very low 10-20, low 25-35, moderate 45-55, high 70-80, very high
85-95) and reserves sub-10 / over-95 for stated absolutes. Every grid value and
edge now carries a `confidence` of high/medium/low. `@network` rules now forbid
fabricating edges from a single org-chart statement: one reporting line is one
defers edge.

`clampPercent` rejects out-of-range values instead of clamping a 150 up to a
fake near-max. `Room.jsx` keeps the extreme-value hold and adds a non-blocking
soft confirm when a placed value has low confidence. Unknown-person references
were already rejected at apply time.

All prompt and validator changes were applied to both `src/lib/llm-prompts.js`
and `functions/index.js`; prompt version bumped to
`room-command-v2-calibrated-2026-06-03` in both. Four offline fixtures added
(banded calibration, low-confidence non-extreme, single-statement single-edge,
validator rejection); offline suite now 11/11. Before/after prompt diffs in
`AUDIT_REPORT.md`. Deferred for review: persisting confidence on placements for a
dashed needs-confirm grid dot (touches stored shape).

## 2026-06-03 - Overnight audit Phase 1: data model review

Audited the People/Grid/Network/Notes/Rooms/Decisions model. Verdict: sound and
sensibly normalized. People are global and referenced by stable uid-prefixed ids
everywhere, including every LLM write path (`findPersonRef` resolves refs to ids
before any commit). Grid values live in `decision.placements[id]={power,interest}`
and stance in `decision.positions[id]`, both render deterministically. Edges are
`{from,to,type}` subcollection docs with direction in `from->to`.

Two items flagged for review, no schema change made: (1) stored situational
values carry no confidence/provenance, which Phase 2 addresses by adding a
confidence field to the interpretation output; (2) reporting lines are stored as
per-decision edges, not room-wide `person.relationships`, which is a deliberate
product choice worth confirming. Diagram and findings in `AUDIT_REPORT.md`.

## 2026-06-03 - Overnight audit Phase 0: architecture coherence

Full-project audit pass. Confirmed the layering is production-standard: UI never
touches raw data, `store.js` is the one access layer, `firestore-repo.js` owns
all Firestore mapping and encryption, and the LLM service is split across the
browser bridge, the Vite local endpoint, and the Firebase Function. Build clean,
offline evals 7/7, no committed secret, Haiku-only.

Main finding: the LLM contract logic (prompts, rules, schemas, normalizers) is
hand-copied into `functions/index.js` because the Function is a separate package
and cannot import from `src/`. The copies are in sync today via the prompt
version string. Documented the drift risk in `architecture.md` and flagged a
shared module or CI version-match check for deliberate follow-up rather than an
overnight refactor.

Fixed doc drift: completed the `architecture.md` folder map (`llm-prompts.js`,
`llm-trace.js`, `trace-summary.mjs`, `OverflowMenu.jsx`) and reworded the
`WELCOME` chat string, which still invited a play, to match the command-first
surface. Findings written to `AUDIT_REPORT.md`.

## 2026-06-03 - Production LLM path smoke tested

The deployed product successfully ran live command calls through the Firebase
Function backend. `@note` saved a person note and `@network` updated the
network in the real product. This confirms the deployed flow is working:
browser command to `/api/**`, Firebase Auth token, Hosting rewrite, Function
auth and budget guard, Anthropic call, validated JSON update, Firestore write,
and trace metadata.

## 2026-06-03 - Hackathon coach brief added

Correction: the hackathon coach brief belongs in the separate Claude coach
project, not in the implementation doc set. Removed `docs/hackathon.md` and
`docs/product-coach-instructions.md`, and restored the root agent pointers plus
`docs/orchestration.md` to the implementation-only read list. The implementation
docs keep the product, architecture, LLM setup, eval harness, and roadmap state.

## 2026-06-03 - Production Claude backend and trace store prepared

The local Claude bridge now has a production counterpart in Firebase
Functions. `functions/index.js` exposes an authenticated `api` function for
`/api/interpret-room-command` and `/api/generate-play`. The browser adds the
Firebase Auth id token to live AI requests, and Firebase Hosting rewrites
`/api/**` to the function. The Anthropic key is read from the Firebase Secret
`ANTHROPIC_API_KEY`; no real key belongs in source control.

The function verifies auth, enforces per-user daily request and cost limits,
calls Claude Haiku by default, validates the JSON contract, records token usage
and estimated cost, and writes trace metadata to
`users/{uid}/llmTraces/{traceId}` plus daily usage to
`users/{uid}/llmUsage/{YYYY-MM-DD}`. Raw prompts and raw model responses are
stored only when `LLM_STORE_RAW_TRACES=true`; the default production posture is
privacy-safe metadata only.

Firestore rules now let users read their own AI usage and trace records while
blocking client writes. A GitHub CI workflow runs the app build, offline eval
harness, and Firebase Function syntax check.

## 2026-06-03 - Command thread now behaves like chat

The command thread previously showed only assistant results, so the user's
actual prompt disappeared. This made the surface feel like an event log rather
than a conversation. `Room.jsx` now stores the sent command as a `user` message
before the LLM call, and `Chat.jsx` renders it as a right-aligned user bubble.
Assistant responses remain structured cards because command outputs can update
the room, ask a clarifying question, or later show a final play.

Command results now use command-specific labels such as Grid updated, Network
updated, and Room updated. `applyRoomUpdate` also scopes model fields by
command: `@note` cannot accidentally move grid placement, `@grid` cannot save
notes or edges, and `@network` cannot alter the grid. Follow-up questions are
shown only when no concrete update happened or when the app is holding an
extreme grid value for confirmation.

## 2026-06-03 - Grid updates made stable and conversational

The grid hint inside the plot area was removed. It overlapped with chips and
made the map harder to read. Interaction hints should live outside the map or
in onboarding, not inside the coordinate space.

Grid chips no longer key off a map nonce. A command update now keeps existing
chips mounted, so one person's placement change does not make every chip blink
or re-enter. The old nonce trigger was removed from `Room.jsx` and
`GridTab.jsx`.

Extreme grid changes now require confirmation. If an LLM response changes
power or interest to near zero or near maximum, the app holds that placement and
asks a short clarification instead of applying it. The `@grid` prompt now
prefers moderate values and asks only when the person or axis is unclear. An
offline eval covers the extreme-value clarification behavior.

## 2026-06-03 - Network layout decoupled from grid changes

Grid commands update power, interest, and stance. They should not redraw the
relationship map. The first automatic network layout ranked people heavily by
grid placement, so a small grid change could move the whole network even when
no relationship changed.

`NetworkTab.jsx` now lays out real rooms from role hierarchy and defers edges.
CEO and CPO roles naturally sit higher, defers edges push the moved person
below the mover, and rows spread by stable role lanes. Grid placement no longer
drives network coordinates. The invisible click target that removed edges from
the canvas was also removed; relationship deletion needs an explicit editing
surface later.

The `@grid` prompt was tightened so successful grid updates do not ask open
questions unless the person or axis is unclear.

## 2026-06-03 - Local auth origin consistency fixed

The Firebase `auth/unauthorized-domain` error during local testing came from
using `127.0.0.1`, while Firebase local auth is normally authorized for
`localhost`. Browser auth persistence is also origin-specific, so changing host
or port can make an existing session look signed out.

`src/main.jsx` now redirects local loopback IP visits to the equivalent
`localhost` URL before rendering. `src/lib/auth.js` explicitly sets
browser-local Firebase Auth persistence before registration, email sign in, and
Google sign in. The auth modal now explains unauthorized-domain errors in plain
language instead of exposing the raw Firebase code.

## 2026-06-03 - Network command layout and trace regression hardened

The broken real-room network view was an app layout issue, not only a Claude
issue. `NetworkTab.jsx` no longer falls back every unknown person to the center
of the canvas. Seed positions apply only to the full seeded preview room; real
rooms get an automatic layout from role weight, grid placement, and decision
edges.

Command application now resolves ids, names, first names, and unique role
matches before creating people, so role language such as CEO, CPO, Head of
Product, Head of Sales, and PM of Web maps back to existing room people. Network
command confirmations use the actual applied edge count instead of trusting the
LLM summary count.

The exact CEO/CPO/PM/Sales prompt from local testing was added as an offline
eval regression. The prompt rules now require every relationship claimed in a
network summary to appear as an edge and call out privileged or helped-by
relationships as ally edges.

## 2026-06-03 - Local LLM trace capture added

Added the V1 trace analysis layer for local Claude testing. Every local live
Claude call now writes an ignored JSON trace under `llm-traces/` with the prompt
version, system prompt, full prompt, request payload, raw Claude response,
parsed JSON, normalized output, validation status, token usage, latency, and
estimated cost. `llm-traces/index.ndjson` keeps a summary row per call, and
`npm run trace:summary` reports aggregate latency, token use, cost, failures,
and the latest trace.

`@network` now uses a network-specific output schema instead of the broad map
schema, so long spoken relationship descriptions have less JSON to produce and
less chance of being truncated. Live eval runs can be bounded with
`EVAL_MAX_CASES` or targeted with `EVAL_CASE_IDS`, so deliberate credit spending
does not become open-ended. The trace store is local only until privacy rules
are ready for Firebase or Braintrust export. The eval harness now also supports
required edge checks so trace failures can be measured by relationship direction,
not just by edge count.

## 2026-06-03 - Chat is command-first while network mapping matures

Corrected the prior open chat screen decision. The product path now disables
normal open prompts in the chat input: Send only enables when the draft starts
with `@`, and `Room.jsx` no longer calls `generatePlay()` from the input box.
This prevents vague prompts from spending Claude credits or producing long
coaching responses while the mapping commands are still being tuned.

`@network` now has command-specific instructions to extract explicit and
strongly implied reporting lines, control, micromanagement, influence, close
ties, alliances, and conflicts into edges. `@grid` is scoped to power,
interest, and stance. `@map` remains broad intake. Command token budgets are now
lower by command type so `@note`, `@grid`, and `@network` ask Claude for smaller
JSON updates. The offline eval suite replaced the low signal play gate cases
with an implicit network extraction fixture and passes 5 of 5 without calling
Claude.

## 2026-06-03 - Open chat now screens low signal play requests

Added a local play request screen so open chat does not spend Claude credits on
short venting or curse-only input. Messages such as a bare insult now return a
clarification asking for the decision, people, and desired outcome before any
model call happens. The same screen runs in the browser and on the local Vite
endpoint. Live play output is capped to keep open coaching shorter and cheaper.

The command path remains the controlled surface for deterministic state changes:
`@note`, `@grid`, `@network`, `@map`, and `@create`. Command open questions are
now capped at two, with one as the target. The offline eval suite gained play
gate cases for the low signal insult regression and an actionable short ask,
and now passes 6 of 6 without calling Claude.

## 2026-06-03 - V1 offline eval harness added

Added prompt versions and a V1 eval harness so local Claude testing is measured
against the product contract, not generic chatbot behavior. `src/lib/llm-prompts.js`
now owns the play and command prompts. `evals/fixtures/v1.json` covers play
focus, ethical influence, note rewriting, framework updates, grid mapping, and
network mapping. `scripts/eval-v1.mjs` validates outputs with the same play and
room command contracts the app uses.

`npm run eval:offline` runs without calling Claude and writes ignored traces to
`evals/runs/latest.json`. Live evals are possible only with `--live` plus
`EVAL_ALLOW_LIVE=true`, so credit-spending runs stay deliberate. The offline
harness passed 4 of 4 cases.

## 2026-06-03 - Chat commands now map notes, grid, and network

Added LLM-backed local command interpretation for `@note`, `@grid`, `@network`,
`@map`, and `@create`. `@note` now asks the local Claude bridge to rewrite the
user's note into a short professional observation and optionally update the
person's framework read. The map commands turn plain language into validated
room updates: people, concise notes, stance, grid placement, network edges, and
open questions.

The app applies only validated fields from the command contract. Person notes
and framework reads stay on the person profile. Grid placement, stance, and
network edges stay scoped to the active decision. Room settings copy now says
Create person for the new person form. A live smoke test reached Anthropic, but
the account reported insufficient credits before returning a model response.

## 2026-06-03 - Local Claude bridge added for chat testing

Added a local-only Claude connection bridge for the chat. When
`VITE_ENABLE_LIVE_LLM=true`, `generatePlay()` posts the compacted decision
context to the Vite dev server endpoint `/api/generate-play`. The endpoint reads
`ANTHROPIC_API_KEY` only from `.env.local`, stays inert unless the live local
flag is true, calls Claude with a play-only system prompt, rejects non-local or
oversized requests, validates the returned JSON play shape, and falls back
safely when the connection fails. The browser never receives the Anthropic key.

This is a development bridge only. Production still needs an authenticated
backend endpoint with App Check, rate limits, cost logging, trace capture, and
an offline eval harness before launch.

## 2026-06-03 - Person removal preserves past influence

Corrected person removal semantics. Removing a person from a room now removes
only that roster entry. The person profile, notes, relationships, past decision
positions, placements, and network edges stay so historic influence remains
visible. This corrects the delete semantics entry below. The confirmation still
uses the word `delete`, but the modal and button copy now say roster removal.

## 2026-06-03 - Delete semantics and modal stability corrected

Delete confirmations now ask for the literal word `delete`, case insensitive,
instead of the room or decision name. Room deletion now removes the room,
decisions, decision edges, generated plays, chat state, and people that belong
only to that room. Decision deletion remains narrow: it deletes the decision and
decision-owned artifacts only, while person profiles and observations stay.
Person deletion was added and removes the profile, observations, relationships,
roster references, decision positions and placements, and network edges around
that person.

The modal backdrop now uses a stable rgba overlay without animation to stop the
dark/light flicker seen while modals are open. The logged in layout gives more
width to the workspace, reduces the chat gap, adds a small grid buffer, and
loosens the decisions/archive spacing in the rail. Landing keeps only Get
started in the top nav, shows How it works before Why, and removes the unasked
middle divider.

## 2026-06-03 - Production accounts start empty and UX shell tightened

Removed real account seeding from the Firestore connection path. New Firebase
users now start with an empty, private workspace; the demo room remains only in
explicit local preview. The Firestore collections stay top level, but app reads
query `ownerId == uid`, generated document ids carry the uid prefix, and rules
enforce the logged in owner or parent room owner. Firebase Console admins see
the shared namespace; app users do not.

Added room roster creation for empty accounts: Room settings can create a
person and add them to the room in one step. The landing page now uses one Get
started entry with sign in and register tabs inside one modal, removes
Northwind, and adds a Why section above How it works. The logged in header is no
longer a home link; sign out is the only route back to landing. The right side
conversation is now a persistent white panel, and the sidebar was softened to
feel more like a focused product navigation rail.

## 2026-06-03 - Firebase Hosting configured and deployed

Added `.firebaserc` and Firebase Hosting config in `firebase.json`. Hosting
serves `dist/` and rewrites all routes to `index.html` for the React app. Ran a
fresh production build and deployed hosting plus Firestore rules to
`the-situation-room-708c6`. The deployed app responds at
`https://the-situation-room-708c6.web.app`.

## 2026-06-03 - Auth modals no longer fall through to preview

Sign in and register no longer silently enter local preview when Firebase config
is missing. In production-like builds, missing Firebase env vars now produce a
clear config error. Local preview requires `VITE_ENABLE_LOCAL_PREVIEW=true`.
This keeps the auth buttons aligned with Firebase and prevents prototype data
from looking like a real account flow.

## 2026-06-03 - Observation delete rule corrected

Live Firebase smoke testing confirmed account creation, Firestore writes,
owner-scoped reads, and sign-in round trip. Cleanup exposed that observations
were too strict: update and delete were both denied. The rule now keeps
observations immutable after create, but allows the owner to delete them. This
preserves the append-only product behavior for normal editing while supporting
privacy deletion and test cleanup.

Firebase Analytics was also wired with a small wrapper in `src/lib/firebase.js`.
The app tracks screen views and safe product events only. It does not send room
names, person names, decision context, notes, or generated play text.

## 2026-06-03 - Firebase Auth and Firestore persistence landed

Prompt 2 finished the Firebase foundation. `src/lib/firebase.js` now initializes
Firebase from Vite env vars and can enable App Check when the reCAPTCHA
Enterprise site key is present. Auth is wired through `src/lib/auth.js`,
`src/hooks/useAuth.js`, the landing modals, and the app gate: landing stays
public, the room view requires a signed in user when Firebase is configured,
and sign out disconnects the store and clears the encrypted cache.

Firestore is now the source of record in configured mode. `src/lib/store.js`
keeps the synchronous mirror and optimistic writes, while
`src/lib/firestore-repo.js` maps the requested schema, seeds new accounts,
subscribes with `onSnapshot`, and deletes nested decision subcollections.
The encrypted local IndexedDB snapshot remains a cache for fast load and
session consistency.

Two note layers are present: `decisionNotes[]` on the decision and append only
person observations under `people/{personId}/observations/{obsId}`. Situational
position and grid placement live on the decision. Stable reads, roles, goals,
relationships, and observations live on the person. Generated plays persist
under each decision, separate from the transient chat stream.

Client side AES-GCM encryption now covers person goal and context, baseRead
text, visual tag teaser text, decision context strings, decision notes,
derived summary, observation text, and generated play situation/output before
Firestore writes. Names, roles, ids, positions, placements, relationship
structure, and edge types stay plaintext so the app can query and render.
The key is derived from the Firebase uid with PBKDF2 in authed mode. This is
encrypted at rest for the prototype, not zero knowledge; a user held secret is
the next stronger privacy option.

`firestore.rules` and `firebase.json` were added. Rules scope top level reads
and writes by `ownerId == request.auth.uid`; decision, edge, and play access is
authorized through the parent room owner. Observations are append only.

The Claude API is still not connected. `src/lib/context.js` now builds the
context payload and `generatePlay()` remains the stub to replace next.

## 2026-06-03 — Persistence shape (correction)

Persistence is Firebase as the store of record, arriving later, with an
encrypted local cache (IndexedDB, AES-GCM) in front for fast load and session
consistency. This corrects an earlier framing of local-first-only. The cache is
not the source of record. On conflict, Firebase wins once it lands.

The store interface in `architecture.md` does not change. The cache sits behind
the same functions. Encryption key is held locally for now; a per-user key from
auth slots in at the auth pass.

## 2026-06-03 — Orchestration layer added

Added `docs/orchestration.md` (the loop), this log, and root pointers
`CLAUDE.md`, `.cursorrules`, `AGENTS.md` so every tool reads the same docs.

## 2026-06-03 — Encrypted local cache landed

Added `lib/crypto.js` (AES-GCM via Web Crypto) and `lib/cache.js` (IndexedDB).
The store hydrates from the cache on init and persists an encrypted snapshot on
every commit, debounced. The whole state blob is encrypted at rest, which covers
every personal field (notes, person context, history). Key lives in localStorage
for now with a TODO to derive it from the authed user.

## 2026-06-03 — UX structure pass

- Sidebar now nests decisions under the active room, archived collapsed within
  decisions. Edit and delete moved to a hover overflow menu. Room delete needs a
  typed confirmation.
- Left rail collapses and the state persists in the cache.
- Decisions include the whole roster by default. People tab removes a
  participant or adds an external. The add from roster action is gone.
- Grid no longer scrolls horizontally. Quadrant tints restored to the tokens.
- Chat resting state is the framed "read the room" card. A commands modal lists
  the chat commands.
- Landing gained a register modal and the app gained a sign out control, both UI
  only with auth wired in the next pass.

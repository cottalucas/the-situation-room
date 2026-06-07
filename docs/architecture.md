# Architecture

## Data model

```
User            users/{uid}
                name, email, position, createdAt, settings

Room            rooms/{roomId}
                ownerId, name, rosterIds[], createdAt
  has a persistent roster of people and many decisions.

Decision        rooms/{roomId}/decisions/{decId}
                title, context{deciding,goal,constraint},
                decisionNotes[{text,ts}], derivedSummary,
                deadline, status(active|archived), participantIds[],
                externalIds[], positions{personId: stance},
                placements{personId:{power,interest,confidence}}, createdAt
  belongs to a room. Pulls participants from the roster, may add externals.
  Positions and placements are per decision, so a person can be against on one
  topic and for on another.

Person          people/{personId}
                ownerId, name, role, goal, context,
                baseRead{scarf,tki,cialdini,fisherUry},
                visualTags{scarfDimensions,tkiStyle,cialdiniLever,fuTeaser},
                relationships[{personId,type}], fresh, external, isSelf, createdAt
  a global profile that compounds across decisions and rooms. Exactly one person
  per account carries isSelf true: the signed-in operator, rendered as "You",
  never duplicated, excluded from the directory.

Observation     people/{personId}/observations/{obsId}
                text, source(note|chat|history), decisionId?, ts
  immutable person memory after create, deletable by the owner for privacy.
  This is the person level notes layer.

Participant     a Person plus per decision position and placement. Derived,
                not stored: store.getParticipants(decisionId) resolves ids to
                people, and the decision holds positions and placements.

Edge            rooms/{roomId}/decisions/{decId}/edges/{edgeId}
                from, to, type(ally|conflict|defers)
  a typed relationship on the network. Defers and influence arrows point to the
  influencer, the `to`.

Play            rooms/{roomId}/decisions/{decId}/plays/{playId}
                situation, output, ts
  durable generated plays.

Message         rooms/{roomId}/decisions/{decId}/messages/{msgId}
                role, type, body, text, label, personName, command, questions, ts
  the persisted chat thread for a decision. Free text fields are encrypted.
```

Relationships in one line: a room has a roster and decisions; a decision has
participants drawn from the roster plus externals; a person carries memory that
spans every decision they appear in.

Deletion semantics: deleting a decision removes only that decision, its network
edges, generated plays, and persisted chat messages. Person profiles and person
observations stay. Removing a person from a room only removes them from that
room roster; their profile, notes, relationships, positions, placements, and
network influence in existing decisions stay. Deleting a room removes the room,
its decisions, their edges and plays, and people that belong only to that room.

Types live in `src/types/models.js` as JSDoc typedefs.

## Data access layer

All reads and writes go through `src/lib/store.js`. The store keeps a
synchronous in memory mirror so React can render without awaiting reads. In
local mode the mirror comes from `src/data/seed.js` plus the encrypted cache. In
Firebase mode, `store.connect(uid)` subscribes to Firestore with `onSnapshot`
and treats Firestore as the source of record. New Firebase accounts start empty.
The seed exists only for explicit local preview.

- `subscribe(fn)` to listen for mirror changes.
- `getSnapshot()` for `useSyncExternalStore`.
- queries: `getRooms`, `getRoom`, `getDecisions`, `getDecision`, `getPerson`,
  `getAllPeople`, `getParticipants`, `getEdges`, `getChat`, `getPlacement`,
  `getProfile`, `getSelf`, `getSelfId`.
- mutations: `ensureSelf`, `savePerson`, `createPerson`, `updatePerson`, `addObservation`,
  `addNote`, `createRoom`, `updateRoom`, `addToRoster`, `removeFromRoster`,
  `createDecision`, `updateDecision`, `archiveDecision`, `deleteDecision`,
  `deleteRoom`, `deletePerson` as roster removal, `addDecisionNote`, `setPosition`, `setPlacement`,
  `movePerson` as a placement alias, `addParticipant`, `removeParticipant`,
  `addExternal`, `addEdge`, `removeEdge`, `pushMessage`, `ensureChat`,
  `savePlay`, `setUserSetting`, `saveProfile`.

User settings (the last-selected room and decision) persist to the signed-in
user in Firestore under `users/{uid}.settings` and mirror into the local prefs
for synchronous reads. `store.setUserSetting(key, value)` writes both;
`connect(uid)` fetches `repo.getUserSettings(uid)` once and merges it into prefs
so a reload restores the last room and decision, even on a cold cache or a fresh
device. Same-browser view state also writes synchronously to localStorage under
`situation-room-ui-state-v1`: active room, active decision, and active lens
(People, Energy, Network). Selecting a decision also writes a stable app route,
`#/decision/:decisionId`, so a hard refresh has a synchronous selected-decision
source before localStorage, IndexedDB, or Firestore finish loading. Route state
wins first, then same-browser state, then synced settings for a fresh
browser/device. Automatic fallback waits until the encrypted cache has hydrated
in local preview, or until Firestore user settings and the first room snapshot
are both ready in production. Invalid, deleted, or archived ids fall back to the
first active decision or a quiet no-decision state. Only non-sensitive ids and
flags live there, so settings stay plaintext. `railCollapsed` stays a local-only
pref (cache, not synced).

The account profile also lives on `users/{uid}`. `name` and `position` are
editable but optional through the shared Profile modal. `position` may be empty
or one fixed value from PM, Engineering, Design, Exec, or Other. `email` is
read-only and comes from Firebase Auth. When present, the saved profile name
wins over the Auth display name for the account greeting. In local preview the
same fields persist through the encrypted cache; in Firebase mode
`store.saveProfile` writes them to the signed-in user's document.

Components never touch raw data. They call store functions. `useStore()` in
`src/hooks/useStore.js` subscribes a component to changes.

`src/lib/firestore-repo.js` owns Firestore mapping, encryption on write,
decryption on read, live subscriptions, and nested subcollection deletes. Store
writes are optimistic, then the snapshot listener confirms the source of record.

## Auth and Firebase

`src/lib/firebase.js` initializes Firebase from Vite env vars. If the required
Firebase env vars are present, landing stays public and the room view requires
Firebase Auth. If Firebase env vars are absent, auth forms show a clear config
error and do not enter the app. Local preview mode is available only when
`VITE_ENABLE_LOCAL_PREVIEW=true` is set. Entering local preview writes the app
route to `#/`, so hard refreshes on localhost stay inside the room view; signing
out clears that route and returns to landing.

Auth lives in `src/lib/auth.js` and `src/hooks/useAuth.js`:

- email and password registration with display name.
- email and password sign in.
- Google sign in.
- sign out clears the active encryption key, disconnects the store, clears the
  encrypted cache, and returns to landing.

Firebase Auth uses explicit browser-local persistence, so a signed-in user
stays signed in across reloads on the same origin. Local development should use
`localhost`, not `127.0.0.1`, because Firebase authorized domains and browser
auth storage are origin-specific. `src/main.jsx` redirects loopback IP visits
to the matching `localhost` URL before the app renders.

Safari and other storage-restricted browsers get a softer path. If browser-local
persistence is blocked, Auth tries session persistence and then in-memory
persistence so sign-in can still complete for the current session. Google
sign-in uses a full-page redirect on iOS Safari and falls back to redirect when
popup sign-in is blocked, then `useAuth()` consumes the redirect result on
return and creates the user document through the same `ensureUserDoc` path.

Optional App Check is enabled when `VITE_FIREBASE_APPCHECK_SITE_KEY` is set.
Use Firebase Console to enforce App Check for Firestore after deployment tests
pass.

Firebase Analytics initializes when `VITE_FIREBASE_MEASUREMENT_ID` is present
and the browser supports Analytics. The app logs screen views and privacy-safe
events such as sign up, login, logout, room creation, decision creation,
external participant add, observation creation, archive/delete, and play
request result. It does not log note text, decision context, person names, room
names, or generated play text.

Novus (Pendo) events for the Influence Ring fire through `trackNetwork` in
`firebase.js`, fire and forget to both Firebase Analytics and `pendo.track` when
the global is present: `network_viewed { roomId, participantCount, edgeCount }`,
`edge_created { roomId, type }`, `edge_deleted { roomId }`, `influence_overridden
{ roomId, newLevel }`, and `influence_inferred { roomId, participantCount,
inferredCount, nullCount }`. Payloads carry only ids, counts, and enum values,
never names, notes, or edge endpoints.

## Encrypted local cache and encrypted Firestore text

The encrypted IndexedDB cache is a cache, not the store of record. Firebase is
the source of record in configured mode. The cache stays in front for fast load
and session consistency.

- `lib/crypto.js` does AES-GCM via the Web Crypto API.
- In local preview, a random device key lives in localStorage.
- In Firebase mode, the active key is derived from the authed Firebase uid with
  PBKDF2. This satisfies encrypted at rest for the prototype, but it is not zero
  knowledge because uid is not a user secret. A future stronger privacy pass
  should derive the key from a user held passphrase or an equivalent secret.
- `lib/cache.js` reads and writes a single encrypted snapshot in IndexedDB.
- `store.js` calls `saveCache(state)` debounced on every commit.

The Firestore repository encrypts these fields before write and decrypts them
after read: person goal, person context, baseRead text, visual tag teaser text,
decision context strings, decisionNotes text, derivedSummary, observation text,
generated play situation/output, and chat message body/text/questions.

Names, roles, ids, relationship structure, positions, placements, and edge types
stay plaintext so the app can query and render the map.

## Firestore mapping

```
users/{uid}                                      { name, email, position, createdAt,
                                                  settings }
people/{personId}                               { ownerId, name, role, goal, context,
                                                  baseRead, visualTags, relationships,
                                                  fresh, external, createdAt }
people/{personId}/observations/{obsId}          { text, source, decisionId?, ts }
rooms/{roomId}                                  { ownerId, name, rosterIds[], createdAt }
rooms/{roomId}/decisions/{decId}                { title, context, decisionNotes,
                                                  derivedSummary, deadline, status,
                                                  participantIds, externalIds,
                                                  positions, placements, createdAt }
rooms/{roomId}/decisions/{decId}/edges/{edgeId} { from, to, type }
rooms/{roomId}/decisions/{decId}/plays/{playId} { situation, output, ts }
rooms/{roomId}/decisions/{decId}/messages/{msgId} { role, type, body, text,
                                                  label, personName, command,
                                                  questions, ts }
```

Chat messages persist per decision under the owning room. Free text (body, text,
questions) is encrypted before write and decrypted on read; role, type, label,
personName, command, and ts stay plaintext so the thread renders and sorts
without decrypting structure. Only meaningful turns are stored (user commands and
assistant confirmations: user, updated, note, added, fallback, coach, read, and
play). A generated play persists as a pinned card; its frozen snapshot rides in
the encrypted body. Welcome and loading cards stay transient UI state. The store keeps optimistic chat in
its mirror and seeds from this history on load, so the conversation survives
reload and sign-in on another device.

All account reads query top level `people` and `rooms` by `ownerId == uid`.
Decision, edge, and play access is authorized through the parent room owner.
The collections are top level shared Firestore namespaces, not nested under
`users/{uid}`. User separation comes from three layers: document ids are created
with the authenticated uid prefix, every top level document stores `ownerId`,
and app queries plus Firestore rules require `ownerId == request.auth.uid`.
Firebase Console admins can see the shared namespace; signed in app users cannot
read another user's documents.

Firestore rules live in `firestore.rules`, with `firebase.json` pointing the
Firebase CLI at that rules file.

## Firebase Hosting

Firebase Hosting serves the built `dist/` folder. `firebase.json` contains the
hosting config, rewrites `/api/**` to the Firebase Function named `api`, and
rewrites all other routes to `index.html` because this is a client side React
app. `.firebaserc` points the default project at `the-situation-room-708c6`.

## Firebase Functions LLM backend

See `docs/llm-pipeline.md` for the end-to-end AI pipeline and MLOps (prompts,
contracts, evals, traces, cost, deploy). This section covers the backend wiring.

`functions/index.js` is the production Claude backend. It exposes one
authenticated HTTPS function, `api`, with two same-origin endpoints:

- `/api/interpret-room-command` for `@note`, `@energy` (alias `@grid`),
  `@network`, `@map`, and `@create`.
- `/api/strategist` for the grounded `@ask` stakeholder coach.
- `/api/generate-play` for the `@play` generator, behind the deterministic
  readiness gate, and play evals.

The browser sends the Firebase Auth id token in the `Authorization` header.
The function verifies the token, checks the per-user daily request and cost
limits, calls Anthropic with the server-side `ANTHROPIC_API_KEY` secret,
normalizes the JSON response, records usage and trace metadata, and returns a
small public meta object to the browser. Raw prompts and raw Claude responses
are not returned to the browser.

Runtime knobs live in `functions/.env.example`. The production key is never in
source control; set it with `firebase functions:secrets:set ANTHROPIC_API_KEY`.
`LLM_STORE_RAW_TRACES=false` stores privacy-safe metadata only. Setting it to
`true` stores prompts, raw model text, and normalized outputs under the user's
trace collection for deeper review.

## LLM context helper

`src/lib/context.js` assembles the payload for Claude calls:

- decision title, context, decisionNotes, derivedSummary, and deadline.
- participants with id, name, role, goal, position, baseRead, relationships.
- recent observations only, capped at the newest five per participant.
- decision edges.

Open (non-command) plain-text chat is parked in the UI while mapping gets
sharper. The chat input only enables Send when the draft starts with `@` (or for
plain text when open chat is on, or when answering a `@play` coaching question).
Sent prompts are stored as user messages before the command result, so the thread
reads like a chat instead of an event log. `generatePlay()` and
`/api/generate-play` are now called by the `@play` command behind the
deterministic readiness gate (see the `@play` section above), so play generation
only spends tokens when the room is ready.

The local Vite bridge and production Firebase Function use the same contracts
and prompt shape. In production, `src/lib/context.js` adds the signed-in user's
Firebase Auth token before calling `/api/**`.

Source of truth versus hand-synced copy: the Vite bridge imports the real prompt
and contract modules from `src/lib/`, so local runs and offline evals share one
source. The Firebase Function is a separate deployed package and cannot import
across that boundary, so `functions/index.js` keeps a hand-copied mirror of the
system prompts, command rules, schemas, and normalizers. The two are kept in
sync by the `COMMAND_PROMPT_VERSION` and `PLAY_PROMPT_VERSION` constants: any
prompt change must be applied to both files and the version string bumped in
both. A shared module or a CI version-match check is the planned hardening.

The LLM bridge supports `/api/interpret-room-command` for chat commands.
`@note` rewrites a user note into a concise professional observation and may
update the person's framework read when there is enough signal. `@energy` reads
power, interest, and stance only and is the user-facing name for the power and
interest lens; `@grid` is kept as a hidden alias for backward compatibility.
Both route to the same internal `grid` command and the same
`decision.placements` and `decision.positions` fields, so the rename is a
command and label change only, with no data migration. `@network` reads reporting lines, control,
micromanagement, influence, alliances, close ties, and conflict into edges.
`@map` is the broad intake command that may create people, save notes, place
people on the grid, set stance, and add network edges. `@create` creates people
from prose. Open questions are capped at two, with one as the normal target.
Network and grid updates stay decision-scoped. Person notes and framework reads
stay on the person profile.

Grid command updates are calibrated, not extreme. The `@grid` prompt maps
qualitative language to explicit bands (very low 10-20, low 25-35, moderate
45-55, high 70-80, very high 85-95) and reserves sub-10 or over-95 for stated
absolutes. Every grid value and edge carries a `confidence` of high, medium, or
low. The validator rejects out-of-range values rather than clamping a stray 150
into a fake near-max. If a changed value lands at an extreme, `Room.jsx` holds
the placement and asks one calibration question; if a placed value has low
confidence, it commits the value but appends one non-blocking soft confirm. The
confidence is persisted on `placements[id]` (additive, defaults to high for
existing data, no migration) and the Energy lens renders a dashed needs-confirm
ring on low-confidence chips. `lib/placement.js` holds the pure helpers
(`buildPlacement`, `placementNeedsConfirm`).

Conversation context window. `compactRoomCommandContext` attaches `recentTurns`,
the last eight persisted user and assistant turns (each trimmed to 240 chars),
alongside the compact room snapshot (people with role, position, placement, recent
notes, and the decision edges). The command system prompt instructs the model to
resolve pronouns and follow-ups like "he", "she", "they", "this", and "too"
against `recentTurns` and the room people, and never to invent a person not in the
room. This gives anaphora resolution through context on Haiku rather than a larger
model. Token budget per call stays small: eight short turns plus the room snapshot
is well under the per-command max tokens.

Open chat (experimental). When `VITE_ENABLE_LIVE_LLM` is on, plain text that is
not a command routes to the grounded strategist through `/api/strategist`, so the
chat can hold an open conversation without becoming a generic chatbot. Two layers
of defense: `src/lib/chat-guard.js#screenOpenMessage` runs first and blocks empty,
oversized, jailbreak/prompt-injection, and short pure-abuse input with a calm
redirect and no model call; whatever passes goes to the strategist, which stays on
the room, declines off-topic and roleplay (`grounded: false`), converts profanity
to professional behavior, never diagnoses, and ignores embedded instructions. The
strategist prompt is `strategist-v2`. Venting that carries real room content is
allowed through and neutralized by the model. Analytics: `open_chat`,
`open_chat_blocked {reason}`.

Guided Setup (one engine, two doors). New account creation marks a one-shot
local onboarding flag. The conversation engine lives in `src/lib/onboarding.js`
(questions, reflection, naming, command plan, closing, trigger guards) and renders
through the single `OnboardingChat` view. Two doors share it:

- First-run: on first login with no usable room (`hasUsableRoom === false`,
  pending marker, not yet prompted) Room opens Guided Setup by default and
  collapses the left rooms rail so the conversation owns the screen. "Open room"
  expands the rail and lands in the populated room.
- "+ New room": the rail's new-room action opens the same engine with
  returning-user framing (no product intro).

Guided chat is the only setup entry point. There is no "Skip, I'll set it up
myself" link. The panel carries a quiet close affordance (`onboarding-close`);
dismissing expands the rail and lands the user in the live empty room (a reused
or fresh empty room, never a modal), with the rail and command surface visible.
Manual room editing stays reachable through the existing room-settings entry
point (rail edit, empty-state actions), unchanged. The entrance uses one calm,
uniform animation (`guided-chat-expand`, a soft fade and rise) on both doors,
with no lateral jump and no abrupt swap to a settings modal. Analytics:
`onboarding_dismissed` replaces the old `onboarding_skipped`.

The three plain-language questions are the decision and a good outcome, the few
make-or-break people, and the relationships (skippable). Between answers the
assistant reflects back one grounded sentence built from the user's own words
(`reflectOnAnswer`, deterministic, no model surface, cannot hallucinate) behind a
brief thinking indicator. Before building it shows one short naming confirm
pre-filled with a short derived title (`deriveDecisionTitle` strips lead-in
filler and caps at a word boundary, never the raw paragraph). The closing names
what it built specifically (`buildClosingSummary`).

The orchestrator is not a second interpreter. It creates the room and decision,
then routes the collected answers through `interpretRoomCommand` with the
existing `@create`, `@energy` (`grid` internally), and `@network` contracts,
validators, and `applyRoomUpdate` write path. `forceCreatePeople` guarantees
every extracted person from the `@create` pass becomes a participant (building
never yields "No participants"), while apply-time `resolvePersonRef` resolution
still dedupes role mentions to existing roster members. No new model path or
calibration logic exists for onboarding. Analytics: `onboarding_started`,
`onboarding_completed`, `onboarding_skipped`, `onboarding_room_created`.

Self as participant. The signed-in operator is a first-class participant.
`store.ensureSelf({name, position})` runs once the account has loaded
(`Room.jsx`, gated on `remoteReady` and a uid). It is idempotent: it guarantees
exactly one person with `isSelf` true keyed to `${uid}_self`, and on the first
run (the `selfSeeded` user setting) attaches self to every existing room roster
and every active decision, migrating older accounts. After that one migration,
removal sticks, so a user can take themselves off a room without it reappearing.
`store.createRoom` seeds self into every new room roster by default; new
decisions pull self in through the roster. Self is removable and never
duplicated: re-adding resolves to the same record because the id is
deterministic. `person-ref.js` resolves first-person references (I, me, my,
myself) to the self record before any create, so the apply path attaches updates
to the operator instead of creating a duplicate. The command context
(`compactRoomCommandContext`) flags the self person with `isSelf`, and the
command system prompt instructs the model to bind first-person to that id and
never create a new person for the operator (prompt version
`room-command-v4-self-2026-06-06`, mirrored in `functions/index.js`). Self
renders distinctly as "You" in the People lens, roster, Energy grid
(`chip-self`), and network, and is excluded from the "Add from directory" list
so neither the user nor the model can create a duplicate. Local preview seeds one
self person in `data/seed.js`; Firestore mode seeds it through `ensureSelf`.
Eval: `npm run verify:self`.

@play (gated terminal output). `@play` runs a deterministic, client-side
readiness check before any model call (`src/lib/play-readiness.js`,
`checkPlayReadiness`). Readiness requires at least two participants with self
counting as one, every participant on a real stance (for, against, neutral),
and every non-self participant placed on the Energy grid. Network edges are not
required at any count. Reason codes for the `play_blocked` event, in priority
order: `missing_people`, `missing_stance`, `missing_grid`. The model never judges
sufficiency; it is computed from existing structural data.

If readiness fails, `@play` generates no play. It pushes a conversational
coaching turn (`buildPlayCoaching`, deterministic) that names what is missing in
plain language and asks one or two coach-style questions about the biggest gap
("How does Chad feel about this one, behind it or pushing back?"), never raw
framework questions. The free-text reply is parsed back through the same `@map`
command path and `applyRoomUpdate`, then readiness is re-checked. It emits
`play_blocked` with the reason code.

If readiness passes, `@play` calls `/api/generate-play` (the existing grounded
play generator, Haiku, no new model path) and persists the result as a pinned,
immutable card: a chat message of type `play` labeled `PLAY · <timestamp>`,
visually distinct from chat bubbles (`chat-play-pinned`), re-openable, and frozen
at generation time. The generating inputs (participant names, situation) are
snapshotted into the card so it stays readable after the room changes or a
reload. The play body is encrypted client-side like other free text (it rides in
the message `body`, and `store.savePlay` also writes the durable Play doc);
analytics logs the `play_generated` event only, never play content. The play
message is persisted and rehydrated (`PERSISTED_MESSAGE_TYPES`), so the card
survives reload and stays readable after further chat. Eval: `npm run
verify:play`.

Grounded strategist. `@ask` (alias `@coach`) calls `/api/strategist`, a calm
stakeholder coach that reasons only over the room snapshot and `recentTurns`. It
returns `{ answer, moves, cites, grounded }`. `normalizeStrategistAnswer` grounds
`cites` to known participant ids and drops anything outside the room, so the
coach cannot reference invented people. It also enforces house style
deterministically: it strips em and en dashes, and a decline (`grounded: false`)
carries an empty `moves` array regardless of what the model returns. The system
prompt (`strategist-v3`) keeps answers to two to four sentences with at most three
one-sentence moves, declines off-topic / roleplay with `grounded: false`, and when
the room is too thin for a confident play it asks one focused question or names
what to map next instead of forcing a full play. It runs on Haiku with a 900 token
cap. This is additive: the
deterministic commands are unchanged. The eval harness scores strategist cases
for grounded cites, a banned trait and diagnosis vocabulary list, and off-topic
decline.

The Read. A grounded read of the room lives inside the chat thread, not as a
separate card, so the lenses (People, Energy, Network) stay the primary view.
`lib/auto-read.js` holds `autoReadEligible` (needs >= 4 participants and >= 2
edges) and the fixed `AUTO_READ_QUESTION`. `Room.jsx` runs The Read only from
the explicit `@read` command and pushes it as a `read` message, which persists
like any chat message. Selecting or restoring a room or decision never triggers
a read. Below threshold `@read` returns a short "basic insights, need more
information" message with no model call, so cost stays near zero. The read
reuses the strategist endpoint, grounding, and banned-trait guard (no new model
path), renders with clickable "Grounded in" person chips, and emits
`read_generated`, `read_shown`, `read_chip_clicked`.

Command application is scoped by command. `@note` may save notes and profile
reads, `@grid` may update placement and stance, `@network` may update edges,
and broad `@map` or `@create` may touch multiple surfaces. If the model returns
extra fields outside the command scope, the app ignores them.

`Room.jsx` resolves command people through `src/lib/person-ref.js`
(`resolvePersonRef`) against ids, names, first names, role and title aliases,
generic leader phrases, and conservative typos before creating anyone. So "Chad",
"the CEO", "head of sales", "the person in charge", and a near miss like "Roven"
all attach to the existing person. `@note` uses `splitLeadingPersonRef`, which
takes the longest leading phrase that resolves exactly (name or role) as the
target and the rest as the note, so multi-word names and titles work
("@note head of sales keeps asking for updates"). Substring and typo matching are
used for direct references but not for splitting a sentence, so a note body is
never swallowed by a role match.

The Network lens is the Influence Ring (`NetworkTab.jsx`), a hand-written SVG
renderer with no graph library. Ring position encodes influence over this
decision: You at the center (ring 0), then high (r 140), medium (r 260, where
null also lands), and low (r 380). Nodes are distributed evenly around their ring
with a per-ring rotation stagger so they never stack across rings, and the layout
has no overlaps for normal counts. Edges are straight lines clipped to node
edges, arrowed, colored by type (ally teal, conflict red, defers a line token).
The pure geometry and interaction logic lives in `src/lib/influence-ring.js`
(`ringLayout`, `clipLine`, `edgeColor`, `gestureForRadius`, `nearestRing`,
`centerDropWrite`, `edgeWrite`, `ringLabelPositions`), so it is unit-testable
without React.

Two desktop pointer gestures, decided by where the press lands on a node:
dragging the core (within 60% of the radius) repositions the node between rings
and writes `influence[id] = { level, overridden: true }`; dragging the rim (60%
to 100%) draws a relationship and opens a picker (Ally, Conflict, Defers to) that
writes an edge. Escape cancels either with no write. The self node never
repositions and has no outbound edge affordance. A press with no drag opens the
node summary. Touch drag is out of scope. Pointer coordinates are mapped through
the SVG `preserveAspectRatio` letterbox, and the capture calls are guarded so a
capture hiccup never aborts a gesture.

`influence` is decision-scoped, like positions and placements: a person can be
high-influence on one decision and low on another. `store.setInfluence`,
`getInfluence`, and `DEFAULT_INFLUENCE` manage it; it round-trips plaintext
through `firestore-repo` (no encryption: it is an enum, not free text) and needs
no Firestore rule change because it writes through the decision document. `@map`
and `@create` infer it (never for the self user, never over a user-set
`overridden` level). Grid placement does not drive the network layout.

## LLM trace capture

Local live Claude calls write raw traces to `llm-traces/`, which is ignored by
git because it contains private prompts and raw model responses. Each trace
stores the endpoint, command, model, prompt version, system prompt, full prompt,
request payload, raw Claude text, parsed JSON, normalized output, validation
status, latency, usage tokens, and estimated cost. `llm-traces/index.ndjson`
stores one summary row per call, and `llm-traces/latest.json` points to the
latest trace. `npm run trace:summary` prints aggregate latency, tokens, cost,
and failures.

Production calls write trace metadata to
`users/{uid}/llmTraces/{traceId}` and daily usage to
`users/{uid}/llmUsage/{YYYY-MM-DD}`. Firestore rules allow the signed-in user
to read their own usage and trace records; writes come from the Admin SDK in
the Function. Raw production prompts and raw model text are stored only when
`LLM_STORE_RAW_TRACES=true`.

This is the V1 trace analysis layer in the AI eval flywheel. Local raw traces
are best for prompt debugging. Production metadata is best for monitoring
latency, cost, model, prompt version, validation failures, and request volume.
Selected consented traces can later be exported to Braintrust for scoring and
dashboards.

## Eval harness

V1 evals live in `evals/`. `evals/fixtures/v1.json` contains synthetic cases for
play focus, ethical influence, note rewriting, framework updates, grid mapping,
and network mapping, including implicit reporting and control edges.
`scripts/eval-v1.mjs` validates the fixtures against the same play and command
contracts the app uses. `npm run eval:offline` is the default no-credit path and
never calls Claude. Live evals require both `--live` and `EVAL_ALLOW_LIVE=true`
so credit-spending runs are deliberate. Eval traces write to
`evals/runs/latest.json`, which is ignored by git.

Onboarding has its own mocked fixture at `evals/fixtures/onboarding.json` and a
deterministic verifier, `npm run verify:onboarding`. It checks the fixed
question flow, one-shot trigger guard, command plan, and normalized mock outputs
without calling a live model.

The Influence Ring has two offline suites: `npm run verify:influence` (5 @map
inference golden cases plus contract guards: clear high, clear low, ambiguous to
null, seniority is not influence, junior gatekeeper is high) and `npm run
verify:influence-ring` (Suite A layout: self centered, high on ring 1, null on
ring 2, no overlap, label positions; Suite B edges: ally and conflict colors,
arrow stops at the node edge; Suite C drag: center drop writes the right level,
sets overridden, edge write creates the right type, escape cancels with no write).

`@play` has a deterministic verifier, `npm run verify:play`: readiness reason
codes (under-threshold rooms never produce a play), the you+1 floor with no
network requirement, the three-or-more case, the coaching turn copy, the coaching
reply parse (a fixed "Chad's against it" reply extracts the against stance through
the `@map` contract), and the generated play shape (all four sections). Self as
participant has `npm run verify:self`: first-person references resolve to the self
record so the apply path attaches instead of creating a duplicate, and the room
context flags exactly one self. Both run offline with no credits.

## Folder structure

```
src/
  App.jsx                 router and auth gate
  main.jsx                entry, imports styles.css, hydrates cache
  styles.css              the design system (see design-system.md)
  data/
    seed.js               explicit local preview mock data
  lib/
    auth.js               Firebase Auth helpers
    cache.js              encrypted IndexedDB snapshot
    context.js            LLM prompt context assembler
    crypto.js             AES-GCM helpers and active key management
    firebase.js           Firebase init from env, optional App Check
    firestore-repo.js     Firestore schema mapping and live subscriptions
    frameworks.js         quadrant logic, framework constants, helpers
    llm-prompts.js        play and command system prompts, prompt versions
    llm-trace.js          local raw trace writer and cost estimator
    onboarding.js         first-run questions, trigger helpers, command plan
    influence-ring.js     pure ring layout, edge clipping, drag-gesture logic
    play-readiness.js     deterministic @play gate, coaching, play snapshot helpers
    play-contract.js      compact LLM context and validate returned plays
    room-command-contract.js compact and validate LLM command updates
    reasoning.js          canned play engine, Claude API later
    store.js              data access layer and Firebase/local mode switch
  evals/
    README.md             eval workflow and live-run warning
    fixtures/v1.json      synthetic V1 eval fixtures
    runs/                 ignored local eval traces
  scripts/
    eval-v1.mjs           offline/live eval harness
    trace-summary.mjs     aggregate local trace latency, tokens, cost
  hooks/
    useAuth.js            Firebase auth state
    useStore.js           subscribe a component to the store
    useIsMobile.js        the < 768px breakpoint hook for the mobile shell
  types/
    models.js             JSDoc typedefs
  components/
    primitives.jsx        Avatar, PositionBadge, QuadChip
    highlight.jsx         framework name highlighting in play text
    Chip.jsx              person token for grid and network
    OverflowMenu.jsx      hover overflow menu for rail edit and delete
    OnboardingChat.jsx    first-run guided setup conversation
    PersonPage.jsx        single person profile page, that person's full data
    PersonNotesPage.jsx   full encrypted notes history for one person
    FrameworksPage.jsx    generic frameworks reference
    NodeSummary.jsx       floating graph node summary card
    MobileDrawer.jsx      right-side mobile nav drawer (rooms, decisions, sign out)
    CommandCompanion.jsx  mobile command companion wrapping Chat full-screen
    Rail.jsx              rooms and decisions navigation
    Chat.jsx              the conversation
    tabs/                 PeopleTab, GridTab, NetworkTab
    modals/               Modal shell, RoomSettings, DecisionSettings,
                          AddParticipant, NewDecision, CommandsModal,
                          ConfirmModal, AuthModal
  views/
    Landing.jsx           public landing, register and sign in entry
    Room.jsx              the app, wires store and UI state together
functions/
  index.js                authenticated Claude API and trace writer
  package.json            Firebase Functions runtime dependencies
  .env.example            function runtime knobs, no API key
firebase.json             hosting, Firestore rules, and function source
firestore.rules           owner-scoped Firestore access rules
```

UI state (which room, which decision, which tab, the selected graph node
summary, the drawer and command-companion open flags, modal flags) lives in
`Room.jsx`. Domain data lives in the store. That split is deliberate. The person
page, person notes page, and frameworks page are driven by the URL hash
(`#/person/:id`, `#/person/:id/notes`, `#/frameworks`), so they are linkable and
the browser back button works; `Room.jsx` parses the hash into a `route` state
and navigates by setting `window.location.hash`. On mobile those route pages keep
the standard app header with the brand and burger, then render a separate back
row below the header so the company name no longer shifts into the back control.
While a route page is open it replaces the lens shell instead of layering over
People/Energy/Network content; the mobile drawer remains mounted so the route
header burger still works.

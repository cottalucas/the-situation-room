# Architecture

## Data model

```
User            users/{uid}
                name, email, createdAt, settings

Room            rooms/{roomId}
                ownerId, name, rosterIds[], createdAt
  has a persistent roster of people and many decisions.

Decision        rooms/{roomId}/decisions/{decId}
                title, context{deciding,goal,constraint},
                decisionNotes[{text,ts}], derivedSummary,
                deadline, status(active|archived), participantIds[],
                externalIds[], positions{personId: stance},
                placements{personId:{power,interest}}, createdAt
  belongs to a room. Pulls participants from the roster, may add externals.
  Positions and placements are per decision, so a person can be against on one
  topic and for on another.

Person          people/{personId}
                ownerId, name, role, goal, context,
                baseRead{scarf,tki,cialdini,fisherUry},
                visualTags{scarfDimensions,tkiStyle,cialdiniLever,fuTeaser},
                relationships[{personId,type}], fresh, external, createdAt
  a global profile that compounds across decisions and rooms.

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
  durable generated plays. The chat stream remains transient UI state.
```

Relationships in one line: a room has a roster and decisions; a decision has
participants drawn from the roster plus externals; a person carries memory that
spans every decision they appear in.

Deletion semantics: deleting a decision removes only that decision, its network
edges, generated plays, and transient chat. Person profiles and person
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
  `getAllPeople`, `getParticipants`, `getEdges`, `getChat`, `getPlacement`.
- mutations: `savePerson`, `createPerson`, `updatePerson`, `addObservation`,
  `addNote`, `createRoom`, `updateRoom`, `addToRoster`, `removeFromRoster`,
  `createDecision`, `updateDecision`, `archiveDecision`, `deleteDecision`,
  `deleteRoom`, `deletePerson` as roster removal, `addDecisionNote`, `setPosition`, `setPlacement`,
  `movePerson` as a placement alias, `addParticipant`, `removeParticipant`,
  `addExternal`, `addEdge`, `removeEdge`, `pushMessage`, `ensureChat`,
  `savePlay`.

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
`VITE_ENABLE_LOCAL_PREVIEW=true` is set.

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

Optional App Check is enabled when `VITE_FIREBASE_APPCHECK_SITE_KEY` is set.
Use Firebase Console to enforce App Check for Firestore after deployment tests
pass.

Firebase Analytics initializes when `VITE_FIREBASE_MEASUREMENT_ID` is present
and the browser supports Analytics. The app logs screen views and privacy-safe
events such as sign up, login, logout, room creation, decision creation,
external participant add, observation creation, archive/delete, and play
request result. It does not log note text, decision context, person names, room
names, or generated play text.

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
and generated play situation/output.

Names, roles, ids, relationship structure, positions, placements, and edge types
stay plaintext so the app can query and render the map.

## Firestore mapping

```
users/{uid}                                      { name, email, createdAt, settings }
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
```

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

`functions/index.js` is the production Claude backend. It exposes one
authenticated HTTPS function, `api`, with two same-origin endpoints:

- `/api/interpret-room-command` for `@note`, `@grid`, `@network`, `@map`, and
  `@create`.
- `/api/generate-play` for the parked play generator and future play evals.

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

Open play chat is parked in the UI while mapping gets sharper. The chat input
only enables Send when the draft starts with `@`; normal text does not call
Claude. Sent prompts are stored as user messages before the command result, so
the thread reads like a chat instead of an event log. `generatePlay()` and
`/api/generate-play` remain as development plumbing for future play evals, but
`Room.jsx` no longer calls them from the input box. This keeps local testing
focused on deterministic commands and avoids spending tokens on vague coaching
prompts.

The local Vite bridge and production Firebase Function use the same contracts
and prompt shape. In production, `src/lib/context.js` adds the signed-in user's
Firebase Auth token before calling `/api/**`.

The LLM bridge supports `/api/interpret-room-command` for chat commands.
`@note` rewrites a user note into a concise professional observation and may
update the person's framework read when there is enough signal. `@grid` reads
power, interest, and stance only. `@network` reads reporting lines, control,
micromanagement, influence, alliances, close ties, and conflict into edges.
`@map` is the broad intake command that may create people, save notes, place
people on the grid, set stance, and add network edges. `@create` creates people
from prose. Open questions are capped at two, with one as the normal target.
Network and grid updates stay decision-scoped. Person notes and framework reads
stay on the person profile.

Grid command updates are conservative around extremes. Normal model outputs
should use moderate values. If a changed power or interest value lands near
zero or near maximum, `Room.jsx` holds that placement and asks a clarifying
question instead of moving the person blindly.

Command application is scoped by command. `@note` may save notes and profile
reads, `@grid` may update placement and stance, `@network` may update edges,
and broad `@map` or `@create` may touch multiple surfaces. If the model returns
extra fields outside the command scope, the app ignores them.

`Room.jsx` resolves command people against ids, names, first names, and unique
role matches before creating anyone. This keeps role language such as CEO, CPO,
Head of Product, Head of Sales, and PM of Web attached to existing people when
the room already has them.

`NetworkTab.jsx` uses the seeded network positions only when every visible
participant belongs to the seeded preview scenario. Real rooms use a
deterministic automatic layout derived from role hierarchy and decision edges,
so new Firebase rooms do not collapse unknown people into the center of the
canvas. Grid placement does not drive the network layout. A grid update should
not reshuffle the relationship map unless it also changes relationships.

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
  hooks/
    useAuth.js            Firebase auth state
    useStore.js           subscribe a component to the store
  types/
    models.js             JSDoc typedefs
  components/
    primitives.jsx        Avatar, PositionBadge, QuadChip
    highlight.jsx         framework name highlighting in play text
    Chip.jsx              person token for grid and network
    FrameworkVisuals.jsx  visual first framework display
    PersonProfile.jsx     floating profile, variant compact | full
    Rail.jsx              rooms and decisions navigation
    Chat.jsx              the conversation
    tabs/                 PeopleTab, GridTab, NetworkTab
    modals/               Modal shell, RoomSettings, DecisionSettings,
                          AddExternal, NewDecision, CommandsModal,
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

UI state (which room, which decision, which tab, the open profile, modal flags)
lives in `Room.jsx`. Domain data lives in the store. That split is deliberate.

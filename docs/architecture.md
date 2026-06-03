# Architecture

## Data model

```
Room            id, name, rosterIds[]
  has a persistent roster of people and many decisions.

Decision        id, roomId, title, context{deciding,goal,constraint},
                deadline, status(active|archived),
                participantIds[], externalIds[], positions{personId: stance}
  belongs to a room. Pulls participants from the roster, may add externals.
  Positions are per decision, so a person can be against on one and for on
  another.

Person          id, name, role, power, interest, goal, context,
                scarf/tki/cialdini/fisherUry (full reads),
                scarfDimensions/tkiStyle/cialdiniLever/fuTeaser (visual tags),
                notes[], history[], fresh?, external?
  a global profile that compounds across decisions and rooms.

Participant     a Person plus a per decision position. Derived, not stored:
                store.getParticipants(decisionId) resolves ids to people and
                the decision holds the positions.

Edge            from, to, type(ally|conflict|defers)
  a typed relationship on the network. defers and influence arrows point to
  the influencer (the `to`).

Note            a string attached to a person. Local only.

HistoryEntry    decision, stance, note. The global memory.
```

Relationships in one line: a room has a roster and decisions; a decision has
participants drawn from the roster plus externals; a person carries memory that
spans every decision they appear in.

Types live in `src/types/models.js` as JSDoc typedefs.

## Data access layer

All reads and writes go through `src/lib/store.js`. Today it is an in memory
store seeded from `src/data/seed.js`, with:

- `subscribe(fn)` to listen for changes. Mirrors a Firestore `onSnapshot`.
- `getSnapshot()` for `useSyncExternalStore`.
- queries: `getRooms`, `getRoom`, `getDecisions`, `getDecision`, `getPerson`,
  `getAllPeople`, `getParticipants`, `getEdges`, `getChat`.
- mutations: `savePerson`, `updatePerson`, `movePerson`, `addNote`,
  `createRoom`, `updateRoom`, `addToRoster`, `removeFromRoster`,
  `createDecision`, `updateDecision`, `archiveDecision`, `setPosition`,
  `addParticipant`, `addExternal`, `removeEdge`, `pushMessage`, `ensureChat`.

Components never touch raw data. They call store functions. `useStore()` in
`src/hooks/useStore.js` subscribes a component to changes.

This is the seam for Firebase. Each mutation has a `// TODO: replace with
Firestore` intent. The function signatures do not change when the
implementation moves to `setDoc` and `onSnapshot`.

## Encrypted local cache

The store is fronted by an encrypted IndexedDB cache. It is a cache, not the
store of record. Firebase becomes the source of record at the auth pass; this
layer stays in front for fast load and session consistency.

- `lib/crypto.js` does AES-GCM via the Web Crypto API. A 256 bit key lives in
  localStorage for now. TODO: derive a per user key from auth.
- `lib/cache.js` reads and writes a single encrypted snapshot in IndexedDB.
- `store.js` calls `saveCache(state)` debounced on every commit, and exposes
  `hydrate()` (loads and decrypts the snapshot on mount) and `reset()` (clears
  the cache, used on sign out).

The whole serialized state blob is encrypted, so every personal field (notes,
person context, history) is covered at rest. The store interface did not change
shape; the cache sits behind the same functions.

## Planned Firestore mapping

```
rooms/{roomId}                          { name, rosterIds, ownerId }
rooms/{roomId}/decisions/{decisionId}   { title, context, status, deadline,
                                          participantIds, externalIds, positions }
people/{personId}                       global profile
rooms/{roomId}/edges/{edgeId}           { from, to, type }
decisions/{decisionId}/chat/{messageId} conversation history
```

Auth gating wraps the room view. Landing is public. See `src/lib/firebase.js`
for the init stub and `src/App.jsx` for where the gate goes.

## Folder structure

```
src/
  App.jsx                 router: landing (public) vs room (will be authed)
  main.jsx                entry, imports styles.css
  styles.css              the design system (see design-system.md)
  data/
    seed.js               all mock data, single source
  lib/
    store.js              data access layer (the Firebase seam)
    firebase.js           init stub, not connected
    frameworks.js         quadrant logic, framework constants, helpers
    reasoning.js          the play engine (canned now, Claude API later)
  hooks/
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
                          AddFromRoster, AddExternal, NewDecision
  views/
    Landing.jsx           public marketing page
    Room.jsx              the app, wires store and UI state together
```

UI state (which room, which decision, which tab, the open profile, modal flags)
lives in `Room.jsx`. Domain data lives in the store. That split is deliberate.

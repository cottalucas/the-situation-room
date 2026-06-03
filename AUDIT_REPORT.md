# Audit Report: The Situation Room

Overnight full-project pass. One section per phase, appended with timestamps.
The executive summary at the top is written last. Each phase is committed
separately so it can be reviewed or reverted on its own.

> Status legend: FIXED (applied this pass), FLAGGED (left for your review with a
> reason), OK (audited, no change needed).

---

## EXECUTIVE SUMMARY

Timestamp: 2026-06-03 (overnight run)

The codebase came in healthy: clean layering, scoped Firestore rules, Haiku-only,
no committed secrets, build green, 7/7 offline evals. The pass focused the energy
on the stated main pain (extreme LLM interpretation) and the requested feature
work, with surgical changes committed phase by phase. Offline evals went from 7 to
15, all passing, no live credits spent.

### What was wrong and what changed
- **Interpretation over-committed to extremes (the core pain).** Fixed: the
  `@energy`/`@grid` prompt now maps qualitative language to calibrated bands (very
  low 10-20 ... very high 85-95) and reserves sub-10/over-95 for stated absolutes.
  Added a `confidence` field per value and edge, a non-blocking soft-confirm for
  low-confidence placements (the extreme-value hold stayed), and out-of-range
  rejection in the validator (a stray 150 is dropped, not clamped to a fake max).
- **@network fabricated edges from single org-chart lines.** Fixed: edges now
  require explicit signal; one reporting line is one defers edge.
- **@map looked like it might be a looser path.** Verified it shares the hardened
  pipeline and tightened its rules to say so.
- **Rendering.** Audited; the store-to-render mapping (grid quadrants, axes,
  stance dots, edge color/direction) is correct. No change needed.
- **"Grid" was an unintuitive label.** Renamed the lens and command to
  **Energy** / `@energy`, with `@grid` kept as a hidden alias and no data
  migration.
- **Chat was ephemeral.** Now persists per decision in Firestore (encrypted free
  text) and rehydrates on load, with a last-8-turn context window plus room
  snapshot for anaphora on Haiku.
- **No conversational reasoning.** Added a grounded strategist (`@ask`) that cites
  only people in the room, declines off-topic requests, and never diagnoses or
  assigns traits; additive to the deterministic commands.
- **Observability.** Per-command token breakdown and a $50-ceiling budget readout
  in `trace:summary`; a root `README.md` with the one-line eval runner and deploy
  steps.
- **Docs drift.** Fixed the folder map and several stale descriptions; documented
  the hand-synced Function copies and the prompt-version sync check.

### Left for your review (could not safely auto-fix overnight)
1. **LLM contract duplication between `src/` and `functions/`.** The Function is a
   separate package and cannot import from `src/`, so prompts/validators are
   hand-copied. Kept in sync this pass via the prompt-version string (both bumped
   together). The proper fix is a shared module or a CI version-match assertion;
   it is a multi-file refactor that risks the deploy, so it is deliberate work.
2. **Low-confidence dashed grid dot.** The `confidence` field exists in the
   interpretation layer; rendering a dashed "needs-confirm" dot would add
   `confidence` to the stored `placements` shape. Low-risk but a stored-shape
   change, left for you.
3. **Per-decision vs room-wide reporting lines.** Reporting edges are
   decision-scoped today. Whether they should persist room-wide
   (`person.relationships`) is a product/schema decision.
4. **Stronger encryption.** Keys derive from the Firebase uid (encrypted at rest,
   not zero-knowledge). A user-held passphrase is the next privacy step, already
   on the roadmap.
5. **Live eval pass.** Offline evals are golden-based. Running the gated live
   suite once (deliberate credit spend) would confirm the new prompts behave on
   real Haiku output, especially the banded calibration and strategist grounding.

### Constraint confirmation
- **Cost: Haiku only.** All call paths default to `claude-haiku-4-5-20251001`;
  the strategist runs on Haiku with a 900 token cap. No Sonnet/Opus path.
  Per-user daily request and cost limits enforced in the Function; `trace:summary`
  watches local spend against a $50 ceiling.
- **No raw production traces.** `LLM_STORE_RAW_TRACES=false` by default; raw is a
  local-only debugging tool. Production stores privacy-safe metadata + usage under
  the signed-in user.
- **Encryption intact.** Personal free text, including the new chat messages, is
  AES-GCM encrypted before Firestore writes.
- **Rules scoped.** Every document is owner-scoped; the new `messages`
  subcollection is authorized through the room owner; notes readable only by owner.
- **All evals pass offline.** 15/15, no live API calls.

### How to run evals + deploy
`npm run eval` (offline, no credits). Live, gated: `EVAL_ALLOW_LIVE=true npm run
eval:live`. Spend: `npm run trace:summary`. Deploy: set the
`ANTHROPIC_API_KEY` Functions secret, `npm run build`, then
`firebase deploy --only hosting,functions,firestore:rules`. Full detail in
`README.md`.

### Commits (revertable, one per phase)
Phase 0 architecture, Phase 1 data model, Phase 2 calibration, Phase 3 @map,
Phase 4 rendering, Phase 5 Energy rename, Phase 6 persistent chat, Phase 7
strategist, Phase 8 evals/observability.

---

## PHASE 0 — Repo & architecture coherence

Timestamp: 2026-06-03

### Method
Read every source file under `src/`, `functions/`, `scripts/`, the Firebase
config, the rules, and the full `docs/` set. Ran `npm run build` (clean, exit 0)
and `npm run eval:offline` (7/7 passing) as the baseline.

### Findings

**1. Separation of concerns — OK, production-standard.**
The layering is clean and consistent:
- UI: `src/views/*`, `src/components/*` never touch raw data.
- State / data access: `src/lib/store.js` is the single access layer with a
  synchronous mirror for React plus optimistic writes.
- Firebase: `src/lib/firestore-repo.js` owns all Firestore mapping, encryption
  on write, decryption on read, subscriptions, and nested deletes.
  `src/lib/firebase.js` owns init and analytics.
- LLM service: `src/lib/context.js` is the browser bridge; `vite.config.js`
  is the local dev endpoint; `functions/index.js` is the production endpoint.
- Contracts: `room-command-contract.js`, `play-contract.js`, `llm-prompts.js`
  hold the prompt text and the validators. UI state lives in `Room.jsx`, domain
  data in the store. That split matches `architecture.md`.

**2. Duplicated LLM contract logic — FLAGGED (drift risk, the main one).**
The production Function (`functions/index.js`) hand-copies the system prompts,
`commandRules`, `commandSchema`, `roomCommandPrompt`, `playPrompt`,
`normalizeRoomUpdate`, `normalizePlay`, `cleanProfilePatch`, `clampPercent`,
`extractJson`, and `maxTokensForCommand` from `src/lib/*`. The Vite local bridge
imports the real modules from `src/`, so local and offline evals share one
source of truth, but the deployed Function does not — it is a separate npm
package and cannot import across the boundary without a build step.

Today the two are in sync (both at prompt version
`room-command-v1-local-2026-06-03d`). The risk is that a future prompt edit
touches only `src/` and silently diverges in production.

- Why not auto-fix now: extracting a shared package and wiring it into the
  Functions build is a multi-file refactor that can break the deploy. That is
  exactly the kind of large rewrite this pass was told to avoid.
- Mitigation applied this pass: every prompt change in later phases is applied
  to BOTH `src/lib/llm-prompts.js` and `functions/index.js`, and the
  `COMMAND_PROMPT_VERSION` string is bumped in both as the sync check.
- Recommended follow-up for your review: move the prompt + contract text into a
  small shared module that both the app and `functions/` consume, or add a CI
  assertion that the two prompt-version constants match.

**3. Docs drift — FIXED.**
`architecture.md` folder map was missing `lib/llm-prompts.js`,
`lib/llm-trace.js`, `scripts/trace-summary.mjs`, and
`components/OverflowMenu.jsx`. Added them. Strengthened the LLM section to state
explicitly that `functions/index.js` mirrors the `src/` contracts as hand-synced
copies kept aligned by the prompt-version string.

**4. Parked / canned code — OK (intentional, documented).**
`reasoning.js` (canned play engine), `generatePlay`, `play-contract.js`,
`savePlay`, `addNote`, `movePerson` are parked plumbing for the play generator,
which `architecture.md` and `roadmap.md` both describe as deliberately on hold
while command mapping matures. Not dead code. One copy nit fixed: the `WELCOME`
chat string invited the user to "ask below for a play," which contradicts the
command-first surface; reworded to match the parked state.

### Firebase configuration

**Auth / Firestore / Hosting / Functions — OK.**
`firebase.json` wires Functions source, Firestore rules, and Hosting (serves
`dist/`, rewrites `/api/**` to the `api` function, SPA-rewrites the rest).
`.firebaserc` pins the default project. No Firestore composite-index file is
needed because every query is a single `ownerId ==` equality on a top-level
collection.

### Firestore security rules — OK, scoped.

`firestore.rules` enforces per-user access at every level:
- `people/{id}` and `rooms/{id}`: read/update/delete require
  `resource.data.ownerId == request.auth.uid`; create requires the incoming
  `ownerId` to be self; update forbids changing `ownerId`.
- `observations`: readable/writable only by the person's owner, append-only
  (`update: if false`), owner may delete for privacy.
- `decisions`, `edges`, `plays`: authorized through `ownsRoom(roomId)`, with enum
  validation on `status` and edge `type`.
- `llmUsage` and `llmTraces`: the signed-in user can read (and delete traces),
  but client writes are blocked (`create/update: if false`) — only the Admin SDK
  in the Function writes them.
Firestore default-deny covers everything else. No rule is over-open. Notes are
readable only by their owner, which satisfies the privacy constraint.

### Secrets / keys — OK, server-side only.

`ANTHROPIC_API_KEY` is a Firebase Functions secret (`defineSecret`) read only
inside the Function. The browser never receives it; the Function returns a small
public meta object, never the raw key, prompt, or response. The local Vite
bridge reads the key from `.env.local` (gitignored) and refuses non-local
requests. `.env.example` ships empty placeholders. A repository scan for
`sk-ant` found nothing committed.

### Cost ceiling — OK, Haiku only.

`DEFAULT_MODEL = "claude-haiku-4-5-20251001"` in both the Function and the Vite
bridge; `functions/.env.example` and `.env.example` pin `ANTHROPIC_MODEL` to
Haiku. The Function enforces a per-user daily request limit (200) and daily cost
limit ($2). No Sonnet/Opus call path exists.

### Changes applied in Phase 0
- `docs/architecture.md`: folder map completed; LLM section notes the hand-synced
  Function copies and the version-string sync check.
- `src/lib/store.js`: `WELCOME` copy reworded to match the command-first surface.

### Left for your review
- The LLM contract duplication between `src/` and `functions/` (finding 2). A
  shared module or a CI version-match assertion is the proper fix and is safer to
  do deliberately than overnight.

---

## PHASE 1 — Data modeling review

Timestamp: 2026-06-03

### Current model (as built)

```
people/{personId}                      GLOBAL, compounds across rooms/decisions
  ownerId            stable owner uid (also the id prefix)
  name, role         plaintext  (queryable, renderable)
  goal, context      ENCRYPTED
  baseRead{}         ENCRYPTED framework text (scarf/tki/cialdini/fisherUry)
  visualTags{}       scarfDimensions[], tkiStyle, cialdiniLever, fuTeaser(enc)
  relationships[]    GLOBAL structural ties {personId, type}
  fresh, external, createdAt
  observations/{obsId}   text(ENC), source(note|chat|history), decisionId?, ts
                         append-only person memory

rooms/{roomId}                         a standing group
  ownerId, name, rosterIds[]  -> people ids (stable)
  decisions/{decId}
    title, context{deciding,goal,constraint}(ENC), decisionNotes[](ENC),
    derivedSummary(ENC), deadline, status(active|archived),
    participantIds[]  -> people ids
    externalIds[]     -> people ids
    positions { personId: stance }            SITUATIONAL  (for|against|neutral|unknown)
    placements { personId: {power,interest} } SITUATIONAL  (0..100 each)
    edges/{edgeId}  { from, to, type }         SITUATIONAL  (ally|conflict|defers)
    plays/{playId}  { situation(ENC), output(ENC), ts }
```

Relationship in one line: a room holds a roster and decisions; a decision draws
participants from the roster plus externals; a person carries memory that spans
every decision they appear in. Power/interest/stance and network edges are
per-decision, so a person can be high-interest and "for" on one decision and
low-interest and "against" on another.

### Findings

**1. Normalization — OK.**
People are a single global collection; everything else references them by stable
id. Grid values live in `decision.placements[personId] = {power, interest}` and
stance in `decision.positions[personId]`, both maps keyed by person id, so a
render reads them in O(1) per person and plots deterministically (GridTab maps
`interest -> left%`, `power -> bottom%`). Network edges are a subcollection of
`{from, to, type}` documents, which makes per-edge add/delete clean and keeps
direction explicit in `from -> to`. No denormalized duplication of person fields
into decisions.

**2. IDs are used consistently everywhere LLM output is written — OK.**
The LLM returns `id` and/or `name`, but `Room.jsx#findPersonRef` resolves every
reference to a stable person id (by id, normalized name, first name, or unique
role match) before any write. New people are created through
`store.createPerson` which mints a uid-prefixed id. Names are never used as
storage keys. Edge `from`/`to`, position keys, and placement keys are all stable
ids. This is the correct discipline and it is enforced in one place.

**3. RAW vs INTERPRETATION vs STORED separation — PARTIAL (sets up Phase 2).**
- RAW user input: the command text, kept as a transient `user` chat message (not
  persisted in production; chat is transient UI state today — Phase 6 changes
  this).
- INTERPRETATION: the normalized LLM update (`resp.update`), ephemeral; captured
  in the local raw trace and, in production, as privacy-safe trace metadata.
- STORED VALUE: what `applyRoomUpdate` commits — the polished observation text
  (encrypted), the placement, the position, the edge.

The separation is real but lossy in one place that matters for Phase 2: stored
placements and positions carry no provenance or confidence. There is no field
that says "this 0 was the model's confident read" versus "this was a hedge."
That is exactly the signal Phase 2 needs to surface low-confidence items
differently. Addressed in Phase 2 by adding a `confidence` field to the
interpretation output; storing it is treated as a low-risk additive change and
decided there.

**4. `defers` naming vs the brief's `defers_to` — OK (cosmetic, do not migrate).**
The brief refers to `defers_to`; the code, rules, validators, and stored data
all use `defers`. Direction is carried by `from -> to` (the arrow points to the
influencer, the `to`). Renaming the stored value would force a data migration
for zero behavioral gain, so it stays `defers`. Noted so the two vocabularies
are not mistaken for a bug.

**5. Two relationship layers (global `person.relationships` vs decision `edges`)
— FLAGGED (design note, no change).**
`person.relationships[]` is a global structural layer; decision `edges` are the
situational network. The `@network` command writes decision edges only, never
`person.relationships`. That means an org-chart "reports to" line is stored
per-decision and does not automatically carry to the next decision in the room.
This is a deliberate product choice (a decision is the unit of analysis), but if
you want reporting lines to persist room-wide, that is a schema/behaviour change
worth deciding explicitly rather than overnight.

### Schema fixes applied
None. The model is sound and low-risk changes would be cosmetic. The one real
gap (no confidence/provenance on stored situational values) is handled in
Phase 2 where the surrounding prompt and validator work lives.

### Left for your review
- Whether reporting lines / structural ties should persist room-wide
  (`person.relationships`) instead of per-decision edges (finding 5).

---

## PHASE 2 — LLM interpretation quality on @grid and @network (CORE)

Timestamp: 2026-06-03

The core problem: the model over-committed to extremes ("very low interest" ->
0 instead of an honest 1-3 band) and over-inferred influence from single
org-chart statements. Fixed at the interpretation layer: prompt, validator,
apply loop, and offline evals. Every prompt change was applied to BOTH
`src/lib/llm-prompts.js` and `functions/index.js`, and the prompt version was
bumped in both (`room-command-v1-local-2026-06-03d` ->
`room-command-v2-calibrated-2026-06-03`).

### 1. Banded calibration (before / after)

BEFORE (`COMMAND_SYSTEM_PROMPT`):
```
- For grid values, use 12 to 88 by default. Use 3 to 97 only when the user
  explicitly says no influence, no interest, total control, or full attention.
  If an extreme is uncertain, omit the value and ask a short open question.
```

AFTER:
```
- Grid calibration. Map qualitative language to a calibrated band, never to an
  extreme: very low maps to 10 to 20, low maps to 25 to 35, moderate or medium
  or some maps to 45 to 55, high maps to 70 to 80, very high maps to 85 to 95.
  Use the band center when unsure. Apply the same bands to both power and interest.
- Reserve values below 10 or above 95 for explicit absolutes only, such as zero
  interest, no power at all, completely disengaged, total control, or full
  attention. A single strong adjective is not an absolute.
```
The `@grid` command rules were updated to point at the bands and to forbid
sub-10 / over-95 output unless the user states an absolute. Same rubric reused by
`@map` and `@create` through the shared system prompt (Phase 3).

### 2. Confidence + clarification loop

- The output schema now carries a `confidence` of high / medium / low per grid
  value and per edge. Added to the system prompt, the per-command rules, every
  schema example, and the validators (`cleanConfidence`, an enum guard).
- `Room.jsx` clarification behaviour now has two tiers:
  - Extreme + changed value: HOLD the placement and ask one calibration question
    (unchanged, pre-existing safeguard).
  - Low-confidence + changed value (not extreme): PLACE the calibrated value but
    append one soft confirm ("I read Sam as roughly 48 power and 30 interest, but
    I was not certain. Adjust if that is off."). This matches the brief's
    "propose a value AND ask a one-line confirming question," is non-blocking,
    and is capped at one confirm. Total questions per turn stay capped at two.

### 3. @network inference discipline (before / after)

BEFORE: `Return every explicit or strongly implied relationship, up to 12 edges.`
plus blanket rules that turned any closeness/conflict language into edges.

AFTER:
```
- Return only relationships the user explicitly states or strongly implies. Do
  not pad the map with inferred edges.
- Edges require explicit user signal. A single reporting or defers statement
  creates exactly one defers edge. Do not also fabricate influence, alliance, or
  conflict from that one statement.
- Add ally only when the user names alignment, support, shared goals, privilege,
  or being helped. Add conflict only when the user names friction, opposition,
  blocking, or competing interests. An org-chart line alone is a defers edge,
  nothing more.
```

### 4. Validation hardening

- `clampPercent` now REJECTS out-of-range values (returns `null` for anything
  below 0 or above 100) instead of silently clamping a `150` up to `97` and
  fabricating a near-max placement. Valid `0`/`100` absolutes still clamp into
  the 3-97 plot range. Mirrored in both validators.
- Unknown-person references were already rejected at apply time:
  `Room.jsx#ensurePersonForUpdate` returns null when a ref cannot be resolved and
  `create` is false, so the write is skipped. Confirmed, no change needed.
- Full path re-verified for each command: input -> `interpretRoomCommand` ->
  `/api/interpret-room-command` -> `normalizeRoomUpdate` -> `applyRoomUpdate`
  (id resolution + scope caps) -> `store` write -> render. `@note` writes only
  notes/profile, `@grid` only placement/position, `@network` only edges; out-of-
  scope model fields are dropped by `commandCapabilities`.

### 5. Offline eval fixtures added (mocked, no API)

- `command-grid-banded-calibration`: "very low interest, very high power" must
  land in the 10-20 and 85-95 bands, with confidence present.
- `command-grid-low-confidence-not-extreme`: "fairly low, not sure" lands in the
  25-35 band (not 0), confidence low.
- `command-network-single-statement-single-edge`: "Maya reports to Sam" produces
  exactly one defers edge (`maxEdges: 1`), no fabricated extras.
- `command-validator-rejects-bad-write`: out-of-range power/interest are dropped
  to null and self / empty edges are removed.
- Harness gained `requireConfidence`, `gridBands`, and `maxEdges` checks.
  Offline suite now 11/11.

### UI affordance decision
The confirm/adjust affordance is delivered as the one-line chat question, which
is the cheapest non-blocking surface. A dashed "needs-confirm" grid dot would
require adding `confidence` to the stored `placements` shape; that is a stored-
schema change, so it is FLAGGED for review rather than done overnight. The
interpretation-layer confidence (the substantive fix) is complete.

### Left for your review
- Optional: persist `confidence` onto `decision.placements[id]` and render a
  dashed dot for low-confidence reads. Cheap but touches stored shape.

---

## PHASE 3 — @map command behavior

Timestamp: 2026-06-03

### Finding: @map already shares the hardened path — confirmed, then tightened.

`@map` (and `@create`) are not a separate code path. They flow through the same
`interpretRoomCommand` -> `roomCommandPrompt` -> `normalizeRoomUpdate` ->
`applyRoomUpdate` pipeline as `@grid` and `@network`, and they share the single
`COMMAND_SYSTEM_PROMPT`. That means the Phase 2 calibration bands, the
`confidence` field, the out-of-range rejection, the extreme-value hold, and the
low-confidence soft confirm all apply to `@map` automatically. In `applyRoomUpdate`
the `@map` capability set enables notes + profile + grid + edges, and the grid
extreme/low-confidence logic runs inside the shared people loop, so there is no
weaker grid path.

Decomposition and dispatch: the model returns a single structured update with
`people[]` (notes, grid, position, profile), `edges[]`, and `decisionNote`, and
`applyRoomUpdate` routes each piece to the right store mutation
(`addObservation`, `setPlacement`, `setPosition`, `addEdge`, `addDecisionNote`).
Per-destination summary already exists: the confirmation is built from counts of
people / notes / reads / grid / network.

### Change applied
Tightened the `@map` and `@create` command rules (both `src/` and `functions/`)
to state explicitly that they use the grid calibration bands, include a
confidence per value and edge, apply the same single-statement edge discipline,
and group the confirmation by destination. This removes any ambiguity that the
broad intake command is a looser path.

### Eval
Added `command-map-calibrated-mixed`: a mixed `@map` input ("very low interest
but a lot of power. She reports to Omar.") that must produce a banded grid value
(power 70-95, interest 10-20), exactly one defers edge, a note, and a confidence.
Offline suite now 12/12.

---

## PHASE 4 — Rendering & display correctness

Timestamp: 2026-06-03

Verified stored values against what is drawn, in code and CSS. No mismatch found;
no code change required.

### Grid (`GridTab.jsx` + styles.css)
| Concern | Stored | Rendered | Verdict |
|---|---|---|---|
| Power axis | `placements[id].power` | `bottom: {power}%` (high = top); Y axis labelled high-top/low-bottom | OK |
| Interest axis | `placements[id].interest` | `left: {interest}%` (high = right); X axis labelled low-left/high-right | OK |
| Quadrant mapping | n/a | `.quadrants` is a 2x2 row-major grid; DOM order satisfied, manage, monitor, informed lands top-left, top-right, bottom-left, bottom-right | OK |

Mendelow check on the quadrant cells:
- top-left = high power / low interest = **Keep satisfied** -> `quad-satisfied` OK
- top-right = high power / high interest = **Manage closely** -> `quad-manage` OK
- bottom-left = low power / low interest = **Monitor** -> `quad-monitor` OK
- bottom-right = low power / high interest = **Keep informed** -> `quad-informed` OK

Stance dots: `dot-for` green (`--for`), `dot-against` red (`--against`),
`dot-neutral` grey (`--neutral`), `dot-unknown` transparent with a dashed
`--unknown` ring. Matches the design system and the legend.

### Network (`NetworkTab.jsx` + seed `EDGE_META` + styles.css)
- Colors: `ally -> --for` (green), `conflict -> --against` (red),
  `defers -> --ink-faint` (grey). The legend swatches (`edge-ally`,
  `edge-conflict`, `edge-defers`) use the same tokens. OK.
- Direction: an arrowhead (`marker #arr`) is drawn only on `defers` edges and
  points at `to`, the influencer. `ally`/`conflict` are undirected lines with no
  arrow, which is the correct semantics. OK.
- Orphans: every participant gets a deterministic layout position
  (`autoNetworkPositions`), so a person with no edges still renders. OK.
- Self-loops: unreachable. `store.addEdge` and `normalizeRoomUpdate` both drop
  `from === to`. OK.

No store-vs-render mismatch. Because nothing changed, there is nothing new to
verify in a browser; the seeded preview room (`VITE_ENABLE_LOCAL_PREVIEW=true`)
remains the visual smoke-test surface if you want an eyes-on pass.

---

## PHASE 5 — Rename "Grid" to "Energy"

Timestamp: 2026-06-03

Renamed the user-facing lens and command to **Energy** / **@energy** (the
subtitle already read "Who to spend energy on"). `@grid` keeps working as a
hidden alias, and no data field or collection was renamed, so there is no
migration and existing muscle memory and stored data are intact.

### Rename map
| Surface | Before | After |
|---|---|---|
| Lens tab label | "Grid" | "Energy" (tab id stays `grid` internally) |
| Command | `@grid` | `@energy` primary, `@grid` hidden alias |
| Command routing | `@grid` -> grid | `@energy` and `@grid` both -> internal `grid` command + `decision.placements`/`positions` |
| Chat placeholder | "Type @network, @grid, @map, @note, or /" | "...@energy..." |
| Chat hint | `@network`, `@grid`, `@map` | `@network`, `@energy`, `@map` |
| Prompt chip | "@grid power and interest" | "@energy power and interest" |
| Commands modal | "@grid <text>" | "@energy <text>" (note: "@grid also works") |
| Fallback message | "Use @note, @grid, ..." | "Use @note, @energy, ..." |
| Docs | brief / roadmap / architecture lens name | "Energy", alias documented |

### What did NOT change (deliberately)
The internal tab id `grid`, the `GridTab` component, the store functions
(`setPlacement`, `getPlacement`), the `decision.placements` / `decision.positions`
fields, the Firestore schema, and the LLM `grid` command key. Only the
command-and-label layer changed.

---

## PHASE 6 — Persistent, context-aware conversation

Timestamp: 2026-06-03

### 1. Persistence (Firestore, under the signed-in user)
Chat messages now persist to `rooms/{roomId}/decisions/{decId}/messages/{msgId}`,
authorized through the room owner (same scope as edges and plays; rule added).
Stored fields: `role`, `type`, `body`, `text`, `label`, `personName`, `command`,
`questions`, `ts`. Free text (`body`, `text`, `questions`) is encrypted before
write and decrypted on read; structure stays plaintext so the thread sorts and
renders without decrypting. Only meaningful turns persist (`user`, `updated`,
`note`, `added`, `fallback`); welcome, loading, and parked play cards stay
transient. The store keeps its optimistic mirror and seeds chat from this history
on load (`chatsFor` prefers existing in-memory chat, then persisted Firestore
history, then the welcome card), so the conversation survives reload and a
sign-in on another device. Messages are deleted with their decision and room.
- Privacy: this is room conversation under the owner, encrypted at rest. It does
  not introduce a new plaintext copy of notes; the `text`/`body` carrying note
  echoes are encrypted like every other free-text field.

Files: `firestore.rules`, `firestore-repo.js` (converters, `addMessage`, message
watch in `watchAll`, load in `loadAll`, delete paths), `store.js`
(`pushMessage` persistence, `chatsFor` rehydration).

### 2. Context window (anaphora without a bigger model)
`compactRoomCommandContext` now attaches `recentTurns`: the last 8 persisted
user/assistant turns (each trimmed to 240 chars) next to the compact room
snapshot (people with role, position, placement, recent notes; decision edges).
The command system prompt instructs the model to resolve pronouns and follow-ups
("he", "she", "they", "this", "too"/"also") against `recentTurns` and the room
people, and never to invent someone not in the room. So "and he reports to her
too" resolves against prior turns and the roster. `Room.jsx` captures the prior
turns before the new user message lands and passes them to both the `@note` and
the map-command calls. Prompt version bumped to
`room-command-v3-context-2026-06-03` in both `src/` and `functions/`.
- Token budget per call: 8 short turns (<=240 chars each, ~ up to 2k chars) plus
  the room snapshot, well under the per-command max tokens (800-2600). Stays
  Haiku, stays cheap. N=8 is a single constant (`RECENT_TURNS`) if you want to
  tune it.

### 3. Grounding
The surface stays grounded by construction: only `@` commands run; non-command
input still returns the "only commands run here" fallback, so the assistant does
not behave like a generic chatbot. The grounded conversational strategist is
Phase 7, which builds on this persisted context.

### Verification
Build clean, offline evals 12/12, function syntax OK, prompt versions in sync.
The persistence path is exercised through Firestore at runtime; a live signed-in
reload is the manual confirmation (offline evals do not touch Firestore).

---

## PHASE 7 — Grounded strategist layer

Timestamp: 2026-06-03

Added a scoped, grounded conversational strategist as a new command, `@ask`
(alias `@coach`). It is additive: every deterministic command works exactly as
before.

### Behaviour
- Reasons only over the room: people, roles, positions, grid placements, network
  edges, notes, and the Phase 6 `recentTurns`. Answers "who should I talk to
  first?", "what am I missing?", "where is the risk?" in the voice of a calm
  stakeholder coach.
- Output: `{ answer, moves[], cites[], grounded }`. `cites` are the person ids it
  reasoned from; `normalizeStrategistAnswer` drops any cite not in the room, so
  the coach cannot reference invented people. The chat card shows the answer, up
  to three concrete moves, and a "Grounded in <names>" line.
- Declines off-topic: generic or off-topic requests return `grounded: false` and
  steer back, so it does not behave like a generic chatbot.
- No diagnosis: the prompt forbids personality types, mental-health language, and
  traits; describes observable behavior and stated positions only. This keeps the
  "no fourth lens, no personality quiz" constraint intact.

### Cost guard
Haiku only, 900 token cap on the strategist call, and the existing per-user daily
request and cost limits in the Function apply unchanged.

### Files
- `llm-prompts.js`: `STRATEGIST_SYSTEM_PROMPT`, `strategistPrompt`, version.
- `room-command-contract.js`: `normalizeStrategistAnswer` (grounds cites).
- `context.js`: `askStrategist` browser bridge.
- `functions/index.js` + `vite.config.js`: `/api/strategist` endpoint (prod +
  local), mirrored prompt and normalizer.
- `Room.jsx`: `@ask`/`@coach` parsing, render, persistence; `Chat.jsx`:
  `CoachMessage`; `CommandsModal.jsx`: `@ask` entry; small `coach-cites` style.

### Evals (mocked, offline)
- `strategist-grounded-who-first`: a grounded answer must cite only room people,
  reference the high-power blocker, and avoid trait words.
- `strategist-declines-off-topic`: a poem/weather request must decline
  (`grounded: false`).
- Harness gained `scoreStrategist`, a `BANNED_TRAIT_TERMS` diagnosis list applied
  to every strategist answer, and `requireCites` / `expectDecline` checks.
- Offline suite now 14/14.

---

## PHASE 8 — Eval & observability maturity

Timestamp: 2026-06-03

### Offline evals are the default no-credit check — confirmed and extended.
`npm run eval` (alias of `eval:offline`) runs `scripts/eval-v1.mjs` with mocked
golden responses; it never calls Claude. Live runs stay gated behind both
`--live` and `EVAL_ALLOW_LIVE=true`. Coverage now spans every command and the
strategist (15 cases, all passing):
- `@note` (note + framework), `@energy`/`@grid` (extreme hold, banded
  calibration, low-confidence), `@network` (implicit edges, trace regression,
  single-statement discipline), `@map` (mixed, calibrated mixed), `@create`
  (people), the `@ask` strategist (grounded, off-topic decline), the parked play
  generator (focus, ethical redirect), and the validator rejection case.

### Trace posture — confirmed, not drifted.
- Local: `src/lib/llm-trace.js` writes full raw traces (system prompt, full
  prompt, request, raw model text, parsed JSON, normalized output, validation,
  usage, latency, cost) to the gitignored `llm-traces/`. This is the prompt
  debugging surface.
- Production: `functions/index.js` writes privacy-safe metadata + usage to
  `users/{uid}/llmTraces` and `users/{uid}/llmUsage/{day}`. Raw prompts and model
  text are stored only when `LLM_STORE_RAW_TRACES=true`; the default is `false`.
  Verified the default and the rules (client cannot write usage/traces).

### Cost / usage log — added per-command tokens and a ceiling readout.
`npm run trace:summary` now reports, in addition to totals and per-command cost
and latency, per-command input/output tokens and average tokens per call, plus a
`budget` block (ceiling, spent, remaining, percent used) against a configurable
`LLM_SPEND_CEILING_USD` (default 50). That makes local spend legible against the
~$50 Anthropic budget. Production daily spend lives in `users/{uid}/llmUsage` and
is additionally capped by the Function's per-user daily request and cost limits.

### One-line eval runner documented.
Added a `README.md` at the repo root documenting how to run the app, the one-line
offline eval (`npm run eval`), the gated live eval, `npm run trace:summary`, the
privacy posture, and how to deploy (Functions secret + `firebase deploy`). Added
the `eval` script alias to `package.json`.

### Cost ceiling / Haiku — reconfirmed.
All call paths default to `claude-haiku-4-5-20251001`; no Sonnet/Opus path exists.
The strategist added in Phase 7 also runs on Haiku with a 900 token cap.

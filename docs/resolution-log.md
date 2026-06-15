# Resolution log

Project memory. Append a dated entry per task. Newest at the top. Do not delete
entries; correct them with a follow up that references the original.

---

## 2026-06-15 - Novus trackAgent instrumentation (content omitted for privacy)

Landed agent analytics for Novus on `src/views/Room.jsx`: a `trackAgentEvent`
helper plus one `prompt` event (after the user message push, before the @play
block) and five `agent_response` events on the live note / map / ask / read /
bare-text paths. All calls are guarded (`window.pendo.trackAgent` is a function)
and fire-and-forget, verified to not throw when the agent is absent.

Privacy decision (hard requirement): `content` is OMITTED from every trackAgent
call. There is no client-side name redactor (product redaction is server-side in
`buildExample`), and participant-scoped redaction cannot cover colleague names
not yet in the roster, e.g. a bare-text message naming a new person before
mapping creates them, or onboarding before participants exist. Rather than ship a
redactor that provably leaks on those paths, content is dropped entirely;
`agentId`, `conversationId` (decision id), `messageId`, and `suggestedPrompt`
remain. Novus gets the interaction structure, not raw text. If prompt/response
pairs are needed later, add them through a server-side redaction pass, never raw
from the client.

Branch handling: `novus/instrument-pendo-track-agent` (PR #2) was NOT git-merged.
It forked ~5,800 lines back (pre Workstream 1/2, influence ring, play-readiness),
so a merge would revert main; its +51-line instrumentation was ported by hand
instead, and the PR closed with that note. PR #3 (30 pendo.track events) closed as
superseded: main's `trackEvent` already forwards every event to `pendo.track`, so
re-adding them would double-instrument. Ported from #3: `open_chat` (only event
genuinely absent on main, added on the bare-text path) and the rename
`onboarding_dismissed` -> `onboarding_skipped` (Novus taxonomy per #3). PR #5
(`novus/pendo-track-events-play-onboarding`) is also superseded (its four
trackEvent->trackNetwork swaps already reach Pendo via the same forwarding, and it
reintroduces the `onboarding_dismissed` name) and was LEFT OPEN, flagged for the
owner to close.

eval 21/21, all `verify:*` green, build clean. Deployed hosting + functions
together; functions skipped as unchanged (still `room-command-v9`), so client and
mapper mirror stay in lockstep.

## 2026-06-15 - Mapper owns placement at onboarding, bare text, and @note

The Mapper now populates placements, stance, and influence (magnitude and
direction) wherever the text supports it, instead of leaning on question-locked
steps or leaving bare text and `@note` thin. The Strategist stays advice-only;
dispatch stays a sequenced state machine with no LLM-to-LLM loop.

- Onboarding (`buildOnboardingCommandPlan`, client-only): the `create` step is
  broadened to also extract stance and any relational/influence signal, every
  step reads all three setup answers (not question-locked), and the `network`
  step always runs so edges and influence populate from relational signal in any
  answer. The `create` command already shared the full `@map` rules and schema,
  so this is prompt text only, no system-prompt change.
- `@note` is no longer observations-only (`room-command-v9-relay-2026-06-15`,
  bumped in both `src/lib/llm-prompts.js` and `functions/index.js`). New
  `commandRules("note")` centers on the focus person and the verbatim note but
  also sets stance, grid (calibration bands + confidence), influence magnitude,
  and relationship edges when the note supports them. The `note` `commandSchema`
  special case was removed so it shares the full intake schema (the
  `npm run eval` schema-sync assertion stays green). `commandCapabilities("note")`
  opens grid/edges/influence. Other `@command` fast paths are unchanged.
- Bare text: `ENABLE_PLAIN_TEXT_ROUTING` defaults on. Bare text runs one
  comprehensive `@map` pass and the reply names the specific changes across
  lenses, built deterministically from the applied update (no second model call,
  no Strategist). Nothing actionable gets a brief ack and one nudge toward
  `@grid`/`@network`/`@play`. The old controller-pill path stays behind
  `VITE_ENABLE_PLAIN_TEXT_ROUTING=false` as a rollback.

Copy note: the spec example used an em dash and a hyphen connector
("Added Priya — VP Eng ... Priya–CFO"); the project copy rules forbid both, so
the deterministic summary uses commas and natural connectors ("Added Priya, VP
Eng, skeptical, high power; flagged the CFO defers to Priya").

Privacy and self unchanged: writes go through the existing store/repo paths,
learning-example redaction stays server-side, and the `isSelf` de-dup in
`applyRoomUpdate` is untouched. Offline fixture `command-note-full-extraction`
locks the broadened `@note` contract; eval 21/21, all `verify:*` green, build
clean.

## 2026-06-14 - Selection lives in the URL, not localStorage

The selected room and decision now encode in the URL hash as the single source
of truth, so a refresh restores the exact view and room/decision links are
shareable. This supersedes the localStorage-backed selection from 2026-06-05 and
2026-06-10: room and decision no longer write to `situation-room-ui-state-v1`
(that key is now cleaned up on load), and the hash carries the room, not only
the decision.

Scheme: `#/room/:roomId` and `#/room/:roomId/decision/:decisionId` (decision
segment optional). Legacy `#/decision/:id` links still parse and resolve their
room from the decision.

- On load, the restore effect reads the route and validates the room and
  decision against the store, waiting for Firestore before judging an id stale.
  A valid route wins; a bare URL with no selection restores the last room from
  synced settings (`lastRoomId`/`lastDecisionId`, server state, not cached
  client state). A stale or inaccessible id falls back to a real room without
  error and replaces the URL.
- A single sync effect mirrors the active selection into the hash on the lenses
  view, covering restore, onboarding, and stale-decision swaps. The hashchange
  handler reconciles selection from the URL on Back/Forward.
- Switching rooms pushes a history entry (Back returns to the previous room);
  switching decisions inside a room replaces (Back does not ping-pong). Verified
  in local preview: refresh holds, room switch + Back/Forward, decision switch
  grows history by zero, cold load on a ghost id heals to a valid room.
- Guided setup "Build room" now writes the new room's URL with its seeded
  decision as a real route change, so a post-onboarding refresh holds.
- Added `room_selection_restored` (fire-and-forget, `{ hadDecision }`, no raw
  ids) which fires only when the restore resolves from the URL, not the
  synced-settings or first-room fallback. Confirmed it fires on a real restore
  and stays silent on the ghost-id fallback.

Decision on a flagged conflict: the task said do not use localStorage, but the
docs called the localStorage layer intentional. Resolution: the URL becomes the
source of truth and the docs (`architecture.md`, `design-system.md`) were
updated to match. The cold-start case (bare URL, no deep link) keeps restoring
the last room from synced settings, per the product owner's call. The lens
(People/Energy/Network) stays in localStorage under `situation-room-lens-v1`
because it is a view preference, not a selection. No state library added; the
existing custom hash router carries it.

## 2026-06-14 - Novus (Pendo) analytics pipeline activated

Novus was returning zero page, feature, and track events. Four root causes,
fixed in one pass. No product behavior, copy, or Firebase Analytics calls
changed.

- Init with empty id. `main.jsx` called `pendo.initialize({ visitor: { id: '' } })`
  on boot, which kept the analytics pipeline inert (replays worked, events did
  not). Removed it. Pendo now initialises in `useAuth.js` once a signed-in user
  resolves: `initialize` on the first auth of a session (module-scoped
  `pendoInitialized` guard), `identify` on later auth changes, both carrying
  `account: { id: u.uid }`. No anonymous id for a private B2B product.
- Hash routing invisible to Pendo. `Room.jsx` drives navigation through
  `window.location.hash` but never called `pendo.pageLoad()`, so three of four
  page URL rules could never match. The hashchange handler now calls
  `pendo.pageLoad()` after `setRoute()`, wrapped in try/catch. The person,
  notes, and frameworks routes all flow through this one handler.
- Most events skipped Pendo. `trackEvent()` (33 of 40 events: sign_up, login,
  room_create, decision_create, play_generated, and the rest) sent only to
  Firebase. It now also calls `pendo.track()`, fire and forget. A `PENDO_DENY_KEYS`
  scrub strips raw identifiers and content (personId, roomId, decisionId, name,
  noteText, text, prompt, body, email) from the Pendo copy only; Firebase keeps
  the full params. Audited every call site: only `read_chip_clicked` carried a
  raw id (`personId`), now stripped.
- Broken `:contains()` selectors. Pendo evaluates CSS selectors server-side and
  does not support `:contains()`. Added unique stable classes to 9 elements so
  Novus can regenerate valid selectors: `tab-${id}` on the lens tabs (yields
  tab-people, tab-grid, tab-network; "grid" is the internal id for the Energy
  lens), `auth-tab-register`, `auth-tab-signin`, `btn-create-decision`,
  `btn-save-profile`, `btn-archive-decision`, `btn-add-external`.

Follow-on correction inside the same pass: `trackNetwork()` delegates to
`trackEvent()` internally, so once `trackEvent` learned to call `pendo.track`,
network events would have fired to Pendo twice and the second (raw) call would
have leaked `roomId`, which FIX 1 had just switched on. Removed the redundant
raw `pendo.track` from `trackNetwork` so it delegates cleanly; the scrub in
`trackEvent` now covers it. Firebase Analytics for network events is unchanged.

Verified in local preview: no pre-auth init, `pageLoad` fires on hashchange,
`trackEvent` reaches `pendo.track` (external_add observed), and the new classes
render. Novus re-sync is a manual product step after deploy and was not run.

## 2026-06-13 - Landing page fills the four classical gaps

The landing covered How and Why but missed what, who, and a path back to
sign-up. A targeted patch closed the gaps without touching structure, section
order, or component hierarchy. Edits confined to `src/views/Landing.jsx` and
the `.landing*` rules in `src/styles.css`.

- Brand mark. Added `.landing-brand` ("The Situation Room") to `landing-nav`
  and changed the `flex-end` nav override back to `space-between` so the brand
  stays visible at every width. Verified at desktop and 375px.
- To whom. Eyebrow sharpened to "For PMs and operators who move decisions
  through people", matching the brief's user definition in active voice.
- What. Hero prop now names the three lenses in one phrase: "Map who holds
  power, who cares, and who moves whom." No new metaphors.
- Path back. New `.landing-cta-section` between Why and the foot with a serif
  kicker and the existing `.landing-cta` button. Three CTAs total across the
  single scroll, one per section.
- Privacy. Added `.landing-privacy-note` in the foot: notes are encrypted and
  stay yours, no sharing, no training. A trust signal for a tool about
  sensitive colleague notes.

Only existing color and font tokens used. No em dashes in any new copy. All new
classes follow the `.landing-*` convention and collide with nothing existing.

## 2026-06-10 - LLM prompt static-review fixes (schema drift, strategist forcing function)

A static review of the pipeline prompts surfaced five issues. All fixed in one
pass, `src/lib/llm-prompts.js` and `functions/index.js` kept byte-identical per
the sync rule.

1. **Schema drift (critical).** `functions/index.js#commandSchema` carried
   `profilePatch: {}` (empty) for the `note` and `map`/`create` cases while
   `src/` carried the full shape (goal, context, baseRead with
   scarf/tki/cialdini/fisherUry, visualTags). Production was showing Haiku an
   empty framework-read target, so SCARF/TKI/Cialdini/Fisher-Ury reads were
   materially weaker in production than dev. Fixed functions to match `src/`
   exactly. Closed the class of bug: `npm run eval` now extracts both files'
   `commandSchema` as text and asserts identical rendered JSON for every command
   (`sync-commandSchema-src-vs-functions`), failing on any future drift even when
   version strings match. Verified the assertion detects the exact `{}` drift,
   not vacuously passing.
2. **Controller `energy` vs `ALLOWED_COMMANDS`.** Verified first: the dispatch
   layer already translated `energy -> grid` (an inline ternary in
   `Room.jsx#dispatchControllerPlan`), so `energy` never hit the server. No
   second translation added. Extracted the single translation into a pure,
   exported `serverCommandForControllerCommand` in the contract, wired Room.jsx to
   it, and added dispatch tests in `verify:classify` (energy -> grid, output is in
   the server's allowed set, note/network/map pass through, null/unknown -> map).
3. **Strategist forcing function.** Each move is now an object
   `{ move, framework? }`. The prompt names the relevant framework lever WHEN the
   room data supports it and OMITS the field otherwise; never invents one
   (optional-when-unsupported, same unknown-is-valid discipline as the mapper).
   `normalizeStrategistAnswer` (both files) accepts a legacy string or an object
   and keeps `framework` only when non-empty. Fixed the sentence-count
   contradiction (system said 2 to 4, schema said 2 to 5; both now 2 to 4).
   Hardened cites as a prompt rule ("when grounded is true, include at least one
   cite") while leaving the normalizer's id-filtering as the hard floor. Made
   sparse rooms explicit: not a decline, stays grounded with minimal moves (zero
   or one). Bumped strategist `maxTokens` 900 -> 1200 in `functions/index.js` and
   the Vite dev bridge.
4. **Mapper wording.** Controller-instruction block changed from "trust it for
   intent" to "Trust it for ROUTING. The verbatim user text below governs all
   saved notes and all inferred values." Saved-note wording softened from
   "one polished note" to "one note in the user's words, cleaned of profanity
   only" to stop over-paraphrasing.
5. **Controller unclear path.** Prompt now states: when intent is unclear, set
   command and cleaned_intent to null and ask exactly one clarifying_question.
   Confirmed `planClassificationAction` reads `intent` first and returns clarify
   without ever forwarding `cleanedIntent`; added two `verify:classify` cases
   asserting an unclear/low read carries no `cleanedIntent`.

Versions bumped in both files: command `room-command-v7-relay-2026-06-09` ->
`room-command-v8-relay-2026-06-10`, strategist `strategist-v4-grounded-2026-06-09`
-> `strategist-v5-grounded-2026-06-10`, controller `controller-v1-2026-06-09` ->
`controller-v2-2026-06-10` (the controller prompt changed for issue 5, so it was
bumped too, beyond the two the review named).

Skipped as instructed (cosmetic): confidence threshold definitions and the
redundant grid-calibration in the `@map` rules.

Eval results, all green. Offline eval 19/19 -> 20/20 (added the commandSchema sync
assertion). verify:classify 23/23 -> 31/31 (added energy->grid and unclear-path
cases, plus the strategist move-shape checks live in the offline eval). All other
suites unchanged and green: learning 18, play 29, network 9, influence 7,
influence-ring 26, self 13, guard 12, onboarding 52, resolution 19, persistence
24, autoread 10, confidence 9. Build clean, functions syntax check clean, prompt
versions in sync, all four prior system prompts plus the new schema byte-identical
across both files. Strategist framework field confirmed optional-when-unsupported:
the fixture proves a move with a lever keeps it and a move without one omits the
field entirely (never null or empty).

UI: `Chat.jsx#CoachMessage` renders the optional framework as a small chip
(`.move-fw`) after each move, handling both legacy string moves and the new
objects so persisted coach messages still render.

---

## 2026-06-10 - Persist the active decision across refresh

Refreshing while inside a decision restored the room but dropped the decision,
landing the user in the room with no decision open. Root cause: the URL hash
`#/decision/:id` was only written by explicit `selectRoom`/`selectDecision`
clicks. A decision reached by auto-restore or auto-selection never wrote the
hash, so the URL stayed empty; the next refresh had no durable decision id and
fell back to the racier browser/synced restore path (which fires when
`remoteReady` flips but does not guarantee the specific decision is applied),
nulling the decision out and latching `restoredSelection`.

Fix (client only, `src/views/Room.jsx`): an effect now keeps the URL hash synced
to the active decision whenever the lenses own the hash, not just on explicit
selection. The hash is the most durable restore source (it lives in the URL and
is read synchronously at init by `parseHash`, driving the reliable route path in
the restore effect). The effect reads the live `window.location.hash` rather than
route state and bails on any non-`#/decision/` hash, so person and frameworks
sub-pages keep ownership and navigation is never clobbered. `clearDecisionHash`
drops a stale decision hash when no decision is active. Verified via build and
the offline + persistence eval suites; the firestore-mode load race is not
reproducible under local preview (which sets `remoteReady` synchronously), so
this was validated by build, evals, and the hash-guard reasoning. Deployed to
hosting only (no functions or rules touched).

---

## 2026-06-09 - Three-role relay: controller -> (mapper | strategist)

Open English now enters one chat through a controller that understands intent
and dispatches; the "three model surfaces" framing in llm-pipeline.md is
replaced by the relay. Everything evolved in place: the intent classifier became
the controller (same `/api/classify-intent` endpoint, same
`ENABLE_PLAIN_TEXT_ROUTING` flag, same `verify:classify` script), and the mapper
and strategist kept their behavior; only their caller changed. Explicit
@commands bypass the controller, unchanged.

What moved and why:

- Controller (`controller-v1-2026-06-09`, mirrored in `src/lib/llm-prompts.js`
  and `functions/index.js`). Output is now `{ intent: map|advise|both|unclear,
  command: note|energy|network|map|null, cleaned_intent, confidence,
  clarifying_question }`. `cleaned_intent` hands the mapper a pre-digested
  instruction instead of raw English; the verbatim user text still rides along
  and stays the source for saved notes, so the user's record is never
  paraphrased. Decision: confidence stays categorical (high/medium/low), not
  0-1; the dispatch table is banded and the eval suite is built on the bands.
- Idiolect moved to the controller. `buildUserPriorsBlock` (the per-user
  name-redacted soft priors) now attaches to the controller call only; the
  mapper no longer receives it. The 5-cap, redaction-before-storage, and
  curated-knowledge-always-outweighs rules are unchanged (`verify:learning`
  still 18/18). Accepted tradeoff: mapping personalization is now indirect,
  through the controller's digest. Note: explicit @commands skip the controller
  and therefore carry no priors; that is by design (idiolect belongs at the
  language stage).
- Shared knowledge base. `FRAMEWORK_GROUNDING` + `GLOBAL_LEARNINGS` extracted
  from inline `functions/index.js` constants into server-only
  `functions/knowledge.js`, now the cached prefix for BOTH the mapper (with the
  extraction contract) and the strategist (without it, ever). Strategist bumped
  to `strategist-v4-grounded-2026-06-09` in both files; its traces now record
  grounding/learnings versions.
- Sequenced dispatch, never an LLM-to-LLM loop. `planClassificationAction`
  (pure, eval-covered) + `Room.jsx#dispatchControllerPlan`. unclear/low asks
  the controller's ONE clarifying question and never guesses. Flag off
  (production default, unchanged): one tappable pill, including a single
  "both" pill that runs map-then-advise on tap; nothing mutates without the
  tap. Flag on: high routes with the "treated as" label, medium with a confirm.
  "both" maps first, then fires the strategist on the updated room.
- Mapper self-check, one pass (`room-command-v7-relay-2026-06-09` in both
  files): when genuinely unsure WHICH mapping, resolve to the safe minimum (a
  note) or return exactly one openQuestion up to the controller, which asks the
  user; the relay caps relayed mapper questions at one. A controller-dispatched
  note without a resolvable focus person falls back to the broad @map intake
  rather than guessing a target.
- Analytics stay content-free: `plain_text_classified` gains `command`,
  `routed_to`, and `resolution` enums; raw text and the cleaned digest are never
  logged, and controller traces store only enums unless
  `LLM_STORE_RAW_TRACES=true`.

Evals: all suites green before AND after (classify 12/12 -> rewritten 23/23 for
the new shape incl. the four relay goldens; offline eval 19/19, learning 18/18,
play 29/29, network 9/9, influence 7/7, self 13/13, guard 12/12). Build clean.
Prompt-version sync verified across `src/` and `functions/`, and all four system
prompts byte-identical. Controller call cost: ~700 input + ~250 output tokens,
about $0.002 per plain-text message on Haiku.

Decisions a future agent should not relitigate: categorical confidence;
controller-only idiolect; pass-both (cleaned_intent for intent, verbatim text
for notes); one pill for "both"; production routing default stays the pill.

## 2026-06-09 - Per-user self-learning example store

Built the third personalization layer: a per-user store of confirmed/corrected
mappings, injected at call time as soft priors below the cached prefix.

Capture. `applyRoomUpdate` now returns `learned` (the grid/stance/influence
mappings that actually committed, grid numbers reduced to bands via `gridBand`).
The command handlers (`@map`/`@energy`/`@grid`/`@network`, `@note`, and the
`@play` coaching reply) call `captureLearnedMappings`, which posts to the new
`/api/capture-example` endpoint. The Function name-redacts the phrasing at write
time (`functions/learning-store.js#buildExample` -> `redactPattern`: every
participant name and first name, plus emails and `@handles`, becomes `[person]`;
emails/handles are redacted first so name redaction cannot break an address into
an unmatchable form), then writes one doc to
`users/{uid}/learningExamples/{exampleId}`:
`{ phrasingPattern, mappingOutcome, axis, action, confidence, weight, createdAt }`.
Raw note text and names never reach Firestore. `action` is accept | adjust |
skip; adjust (a correction) is the strongest signal, skip a low-weight negative.

Privacy. Two enforcement points: redaction before storage, and
`firestore.rules` denying the client both read and write on `learningExamples`
(only the Admin SDK in the Function touches it, with verified auth). Verified the
store logic and contents are absent from the built `dist/`. Analytics are
content-free: one fire-and-forget `example_captured { action_type, was_adjusted }`
via `trackNetwork`, never phrasing, names, or note text.

Use at call time. The static cached prefix (grounding + global learnings) is
unchanged and stays cached. The Function reads the user's recent examples
(`readUserExamples`, ordered by recency through the automatic single-field index,
over-fetched then capped, best-effort so a read failure never breaks a command),
builds a soft-prior block, and appends it as one extra system block AFTER the
`cache_control` breakpoint. Hard rule, stated in the block and enforced by
selection: curated grounding + global learnings ALWAYS outweigh user priors; skip
negatives are never surfaced; the slice is capped at five (`MAX_USER_PRIORS`) so
repeated user mistakes cannot dominate. Traces record `userPriorsCount`.

Dependency interpretation flagged (orchestration loop step 2). The task said it
"depends on the suggestion confirm/adjust/skip flow existing." That flow exists
conversationally, not as discrete Accept/Adjust/Skip buttons: the model proposes
and applies, low-confidence reads append a soft-confirm, and extreme changes are
held for a clarification. Mapping chosen and documented: ACCEPT = a mapping that
committed from a user note; ADJUST = a submission that answers a prior soft-confirm
or clarification (the last assistant turn carried questions, `lastTurnHadQuestions`);
SKIP = supported end-to-end in the Function, store, and evals but not actively
UI-triggered in v1 (no clean dismiss action; the spec marks skip optional). If a
discrete button flow lands later, only the capture trigger changes.

Eval. `npm run verify:learning` (18/18), imports the pure helpers and proves
(a) name redaction before storage (names, full names, possessives, emails,
handles, plus substring safety), (b) user examples are soft priors that never
override a clear grounding rule (block marks them lowest priority, states the
grounding always outweighs, never surfaces skip negatives), (c) the five-example
cap holds and keeps the most recent. No live eval changes this pass; each stored
example is shaped as input phrasing -> expected mapping so it can seed one later.

Server-only module. `functions/learning-store.js` is bundled with the Function
and never imported by `src/`. The Vite dev bridge redacts through the same helper
for parity but does not persist examples or inject priors (production-only
feature, the same accepted dev gap as grounding/global learnings). Offline evals
19/19, build clean. Deployed Functions + hosting + rules; pushed.

---

## 2026-06-09 - GLOBAL_LEARNINGS: curated phrasing heuristics in the cached prefix

Added a second server-only static module, `GLOBAL_LEARNINGS`
(`GLOBAL_LEARNINGS_VERSION = global-learnings-v1-2026-06-09`), to
`functions/index.js`, appended to the cached command prefix immediately after
`FRAMEWORK_GROUNDING` and before `COMMAND_SYSTEM_PROMPT`. The system is now three
static blocks (grounding, learnings, parser prompt) with
`cache_control: { type: "ephemeral" }` still on the last, so the static prefix
caches as one block; per-call note text and room snapshot stay below it in the
user turn.

Content: 12 curated, name-agnostic phrasing-to-mapping heuristics that hold across
all users, each a concrete phrasing with a `[person]`/`[other]` placeholder mapped
to an axis or stance plus a short reason (for example, "rubber-stamped it" ->
interest low not stance supportive; "others run things past [person]" -> power
high; "went quiet after raising concerns" -> stance unknown; "keeps re-raising the
same objection" -> interest high, stance resistant). It refines the grounding's
signal-mapping with concrete language. Each rule is phrased as input phrasing ->
expected mapping so it can later be turned into an eval case (no eval changes in
this pass, as instructed).

Curation and budget: the set is curated by hand, NOT auto-grown from user data
(this is the boundary that keeps it a static, reviewable, name-agnostic asset and
not a per-user data sink). Grounding plus learnings is 701 words, under the ~900
budget; the rule is to tighten rather than add when it grows.

Same privacy as the grounding: server-only, bundled with the Function, not in
Firestore and not in `src/lib` (browser-bundled), so the client cannot read it. No
Firestore path touched, so `firestore.rules` is unchanged. Verified absent from
the built `dist/` bundle.

Caching unchanged in spirit: cached prefix is now ~1753 tokens, still below the
Haiku 4.5 4096-token floor, so `cache_read_input_tokens` stays 0 by design; the
wiring is correct and free and auto-activates when the curated learnings push the
prefix past 4096. This is the expected growth path the earlier decision named.
Traces now also record `learningsVersion`. Version sync still holds: the learnings
are functions-only with their own version, excluded from the
`COMMAND_PROMPT_VERSION` check, and `COMMAND_SYSTEM_PROMPT` is byte-identical
across `src/` and `functions/`. The Vite dev bridge does not carry the learnings
(same accepted dev parity gap as the grounding). Offline evals 19/19. Deployed
Functions + hosting; pushed.

---

## 2026-06-09 - Server-only framework grounding as cached command prefix

Added a private `FRAMEWORK_GROUNDING` constant (`GROUNDING_VERSION =
framework-grounding-v1-2026-06-09`) to `functions/index.js` and wired it as the
cached system prefix on every structured command (`@note`, `@grid`/`@energy`,
`@network`, `@map`, plus internal `create`/`net`). Content is timeless theory
only: power versus interest as independent axes (with the explicit rule that
disengagement, lateness, and "does not care" are interest signals that never
lower a power read), Mendelow quadrants, one operational signal line each for
SCARF / Cialdini / Thomas-Kilmann / Fisher and Ury, the signal-reading lenses
(silence is not assent, loss aversion in reorg and budget fights, stated reason
is not the real reason, deference reveals power, one data point is low
confidence), the stance vocabulary (supportive/resistant/neutral/unknown, unknown
terminal), and the output contract (note applies verbatim; stance/grid/influence
are suggestions with a <=12-word reason each, omit rather than fabricate). No
named people, worked cases, or colleague data: examples are explicitly deferred
to a separate example store. ~452 words, ~699 tokens.

Privacy. It is bundled with the Function only. It is NOT in Firestore and NOT in
`src/lib/llm-prompts.js` (which is browser-bundled), so the browser client cannot
read it. No Firestore path was touched, so `firestore.rules` needed no change
(the requirement to set client read = false only applies if a path is added). The
browser still sends only a note; the Function prepends grounding, calls Haiku, and
returns the normalized result.

Caching. System is two static text blocks, grounding then `COMMAND_SYSTEM_PROMPT`,
with `cache_control: { type: "ephemeral" }` on the last so the static prefix
caches as one block; per-call note text and room snapshot stay below it in the
user turn (`roomCommandPrompt`). Cache token fields already flow through
`usage` -> `estimateCostUsd`/`publicMeta`/`recordUsage`.

Conflict flagged and resolved (orchestration loop step 2). Haiku 4.5 only caches
prefixes >= 4096 tokens, but the dense module plus `COMMAND_SYSTEM_PROMPT` is
~1356 tokens, so "cached prefix" and "verify cache hits" cannot both hold on
Haiku-only without padding. The user chose density over forcing a hit: wire
`cache_control` as specced, do not pad, accept `cache_read_input_tokens = 0` at
current size (the wiring is correct and free, since a sub-floor prefix is not
charged a write, and auto-activates if the shared prefix later crosses 4096 as
global learnings and per-user examples grow). The verification step was replaced:
instead of asserting non-zero cache hits, confirm (a) the static prefix and
dynamic note text are correctly separated (static in `system`, per-call content
in the user turn) and (b) the prefix token count is logged so the approach to
4096 is visible. Each command trace now records `groundingVersion` and an
approximate `systemPrefixTokens` (heuristic ~4 chars/token), and the Function logs
the prefix size on cold start.

Version sync. The grounding is functions-only, so it carries its own
`GROUNDING_VERSION` and is excluded from the `COMMAND_PROMPT_VERSION` sync check;
`COMMAND_SYSTEM_PROMPT` stays byte-identical across `src/` and `functions/`, and
the prompt-version diff still passes. The Vite dev bridge imports
`COMMAND_SYSTEM_PROMPT` from `src/lib`, so it does not carry the grounding: an
accepted dev parity gap in service of keeping the theory off the client. Offline
evals 19/19. Deployed Functions + hosting; pushed.

---

## 2026-06-08 - Fix: Commands modal hidden behind the mobile companion

Follow-up from a user report that the "/" button "did not open the command list"
on mobile. It did open it; the modal backdrop (z-index 120) sat below the
full-screen command companion (`.command-scrim`, z-index 130), so the modal
rendered behind it and looked dead. Bumped `.modal-backdrop` to 140 (above the
companion and the mobile profile scrim, still below the full-screen page at 150
and the nav drawer at 180, neither of which is open while the commands modal is).
Pre-existing layering bug, not from the command-pipeline pass. Hosting only.

---

## 2026-06-08 - @network owns influence, command cleanup, gated plain-text routing

Three command-pipeline fixes plus a Network tooltip micro-fix. This pass touches
the LLM prompts and Firebase Functions, which earlier passes were told to avoid,
so it was flagged first: two items materially conflicted with the docs and the
user resolved each before any code (see below). Deployed Functions + hosting.

Conflicts flagged and resolved (orchestration loop step 2):
- FIX 3 plain-text routing contradicted the roadmap ("re-open plain chat only
  after eval scores are good enough") and turned plain text into a state-mutating
  path. Resolution: build it but gate all mutation behind
  `ENABLE_PLAIN_TEXT_ROUTING` (off in prod). Flag off, a confident classification
  shows a tappable suggestion pill that runs the real command only on tap; low or
  unclear shows the command menu. Nothing mutates without a tap.
- FIX 2's "@map classifies then calls sub-handlers" contradicted the Haiku-only,
  single-deterministic-call principle. Resolution: keep the one validated @map
  call (it already routes to people/notes/energy/network); reword the description
  only.

FIX 1, @network owns influence. The bug: @network only wrote edges, so "Tymon has
lower influence" never moved Tymon's ring. The influence schema already existed on
`people[].influenceLevel`, so the fix reused it rather than inventing the spec's
parallel `influenceUpdates` array (same spirit as keeping the `defers` token, not
`defers_to`). `commandCapabilities` and `influenceDecision` moved into
room-command-contract.js as pure, shared helpers: @network gained the influence
capability (and keeps edges), still never gets the grid capability, so it can
never touch power/interest. influenceDecision returns write / ask / skip:
self-skip, a hand-set `overridden` level is never overwritten, and an uncertain
(@network low-confidence) read asks a ring-specific clarifying question instead of
writing. The @network prompt was rewritten to a JOB 1 (edges) / JOB 2 (influence)
structure with the high/medium/low definitions and a CRITICAL DISTINCTION block
(influenceLevel is the ring, power/interest is the Energy lens, never conflate,
never ask about power when the user said influence), mirrored in both `src/` and
`functions/`, version bumped to room-command-v6-network-influence-2026-06-08.
Five acceptance evals written first (`verify:network`, 9/9): explicit writes,
implied writes, ambiguous asks, overridden blocks, @network never touches grid.

FIX 2, command cleanup. Removed `@create` from the commands panel and the
user-facing router (regex + fallback copy); kept the internal `create` path
because onboarding still drives it. Updated @add ("Add a person to this decision
by name and role", no "outside person"), @network ("Map relationships and
influence..."), and @map ("Describe the situation in plain language. Routes to the
right commands automatically.").

FIX 3, plain-text classifier. New cheap Haiku call `/api/classify-intent` (prompt
`intent-classify-v1`, mirrored in functions and the dev middleware), client
`classifyIntent`, contract `normalizeClassification` + `planClassificationAction`
(the routing table, `verify:classify` 12/12). A malformed or unclear intent drops
to low confidence so it never routes. onSubmit was made to accept a string as well
as a form event, so the suggestion pill re-runs the text as a prefixed command
(`@network ...`) through the exact same command path, reusing person resolution
and apply. Analytics fire `plain_text_classified { intent, confidence, acted }`,
never the raw text; the dev trace stores only the intent and confidence.

Micro-fix: the You node tooltip dropped the "The decision-maker" subtitle for
"This map shows the room from your perspective." (13px, --ink-soft). Shipped and
deployed on its own first.

Verified: all offline evals green (network 9, classify 12, influence 7, ring 26,
guard 12, play 29, self 13), build clean, functions lint clean. Browser smoke in
local preview: commands modal shows the new set with no @create; the suggestion
pill and command menu render, and tapping the pill re-runs the text as @network.
Live @network influence and the live classifier ride on VITE_ENABLE_LIVE_LLM and
were covered by the offline evals, not by spending credits in this pass.

---

## 2026-06-08 - Influence Ring: stable angles, drag affordances, larger type

Three renderer-only fixes to the Network lens. No prompt or other lens touched.

FIX 1, angular position is owned per person. The bug: every render recomputed
even-distribution angles per ring, so moving one person to another ring shifted
everyone who shared the destination ring. The fix stores an `angle` (radians) on
each `influence[personId]` record. This extends the existing schemaless influence
map, so it is not a Firestore schema change (rules gate the decision doc on
ownership and validStatus only, no per-field shape), and `store.firestore-repo`
already round-trips the whole influence map. Added `store.setInfluence(..., angle)`
(merges, preserving the prior angle so an @map level change never moves a node)
and `store.setInfluenceAngle` (angle only). A core drag now writes the drop
point's ring and angle in one write. `models.js` documents the optional field.

The interesting part: the spec said to persist a per-ring even-distribution
default on first render and rely on that write. In practice that is fragile. Live
debugging showed the persist effect fired and wrote, but the async local-mode
`store.hydrate()` (and, in Firestore mode, the first snapshot) commits a fresh
state right after, stripping the just-written angles, and a write-once ref guard
then blocked any retry. So early writes never stuck. Two changes fixed it for
good:
  1. The default angle is now derived from a roster-wide, id-sorted slot
     (`defaultAngleFor`), independent of ring membership. This makes correctness
     not depend on persistence at all: with or without a stored angle, moving one
     person moves only that person, because nobody's default depends on who else
     is on their ring. Verified in-browser after a cache clear: dragging Lin
     low to high left Priya, Raj, Dana, Marco, and You byte-for-byte identical.
  2. Persistence is now self-healing (no permanent guard): it rewrites any node
     still missing a stored angle until the write lands, surviving the hydration
     clobber. Verified: after the drag and a reload, every node carried its angle
     and Lin stayed exactly where it was dropped.
This is a deliberate deviation from the spec's literal "even distribution for
that ring" default, chosen because per-ring distribution requires a reliable
freeze and the global-slot default is overlap-free for realistic rooms and
correct unconditionally. Flagged here rather than shipped silently.

FIX 2, both drag gestures are now legible on hover. The core shows a soft white
inner disc (`r * 0.55`), the rim a dashed ring at `r + 5` with four N/E/S/W ticks
fading in over 150ms; cursors are grab (core) and crosshair (rim). During a rim
drag a valid target pulses (`ring-target-pulse`, fill-box scaled so it stays
centered wherever the node sits) and an invalid target (You) shows a red tint and
a not-allowed cursor. You shows a tooltip on hover but never an affordance;
self-hover was enabled (it was previously suppressed entirely) so You still gets
its tooltip.

FIX 3, type sizes raised across the lens: node labels 13/12/11 by level, You
13/700, ring labels 11px at 0.06em, tooltip name 15px and body 13px, picker
eyebrow 10px. This also retires the sub-11px labels the previous pass had flagged.

Eval `verify-influence-ring` grew Suites D6/D7 (unstored nodes do not redistribute
when one changes ring) and now runs 26/26. Build clean. Verified live in local
preview via simulated pointer drags and computed-style reads. Client-only;
deployed to hosting.

---

## 2026-06-08 - Influence Ring: visual hierarchy polish pass

Craft-only pass on the Influence Ring. No data model, Firestore, prompt, or drag
logic touched. Five visual changes so the ring reads as a hierarchy at a glance.

1. Nodes now encode influence by size and color. New fill/stroke pairs per level
   (high `#3D2C8D`/`#2A1F6B`, medium `#C4611A`/`#A0501A`, low `#D4916A`/`#B07050`),
   radii self 36 / high 30 / medium 24 / unknown 22 / low 19. Larger and darker
   reads as more influence.
2. Null influence stopped masquerading as medium. ringLayout now sets a distinct
   `unknown` render level (warm gray `#B0A898`, dashed outline, r 22) while still
   landing on ring 2, so ambiguity is visible. The ring placement and drag snap
   logic are untouched; only the render level and styling changed.
3. You reads as the anchor, not a participant: near-black fill, no stroke, a soft
   glow, a thin halo ring at r+8, label "You" beneath the node, and no cursor
   affordance (it already could not be dragged).
4. Ring guides are visible (`--line-strong`, 0.6 opacity, 6 4 dash) with subtle
   tint bands behind them, and the labels moved to the top center of each arc,
   uppercase. The relationship picker anchors near the midpoint of the two nodes
   (flipping below at the top edge) instead of floating at canvas center, with a
   "Set relationship" eyebrow and color-coded pills.
5. The hover tooltip swapped the meaningless "Position unknown" for an influence
   badge tinted to the level plus a provenance line ("Influence set by you" vs
   "Influence inferred from notes"). The empty state (fewer than two participants)
   is now a three-arc icon over a two-line prompt.

Conflicts flagged before building (per the orchestration loop) and resolved by
treating the spec as the new intent, then updating design-system.md to match:
the old doc described You as white fill with ink stroke, node radii 40/30/24/20,
and ring labels top-right at 11px. All superseded here. One minor deviation from
the stated type floor: the ring labels render at 10px and the picker eyebrow at
9px (the doc's label floor is 11px). Kept per the explicit spec because both are
tracked uppercase micro-labels, not reading text; noted here so it is a decision,
not a regression.

One eval assertion updated to match: verify-influence-ring A5 asserted labels
were top-right (`x > center`); it now asserts top-centered above each arc
(`x === center`, `y < center - radius`). Geometry helpers `annulusPath` (zone
bands) and `pickerAnchor` (picker placement) added to influence-ring.js as pure,
testable functions.

Verified: `npm run verify:influence-ring` 19/19, `npm run build` clean. Live
check in local preview mode (the-room-preview) confirmed computed styles match
the spec exactly (high `rgb(61,44,141)`, self `rgb(26,26,46)` with the glow, halo
`rgba(26,26,46,0.15)`, guides at 0.6 opacity, labels 10px uppercase) and the
tooltip badge plus provenance line render. No console errors. Client-only;
deployed to hosting.

---

## 2026-06-07 - Influence Ring: the Network lens redesign

Replaced the Network lens with the Influence Ring, a concentric-ring SVG layout
where ring position encodes influence over the decision. Six phases in one pass.

Conflicts flagged before building, resolved with the user, then carried into the
docs: (1) the brief's premise of a force-directed graph and a graph library is
false, the old lens was already hand-written SVG with a role/edge auto-layout, so
there was nothing to remove, only to replace; (2) influence is stored per decision
(decision.influence[personId] = {level, overridden}), parallel to positions and
placements, not on the person document, because influence is "over this specific
decision" and varies by decision, this needs no Firestore rule change since it
writes through the decision; (3) the edge token stays "defers" (no migration, no
rules or prompt-token churn, no production data break) and the UI shows "Defers
to". User chose all six phases in one pass.

P1 data model. Added decision.influence with DEFAULT_INFLUENCE {level:null,
overridden:false}, seeded on decision/participant/external creation, removed on
participant removal. store.setInfluence/getInfluence; round-trips plaintext
through firestore-repo (enum, not free text). Seeded levels on the salesforce
decision. Edges unchanged (already {from,to,type}).

P2 @map prompt. Added influence inference rules and influenceLevel to the
map/create schema in both src/lib/llm-prompts.js and functions/index.js;
normalizeRoomUpdate validates influenceLevel (valid level or null) in both
mirrors. applyRoomUpdate writes influence for map/create, skipping the self user
and any overridden level, and fires influence_inferred. Prompt bumped to
room-command-v5-influence-2026-06-07 in both files. Five inference evals plus
contract guards: npm run verify:influence (7/7).

P3 render. Rewrote NetworkTab.jsx as the Influence Ring (no library). Pure
geometry in src/lib/influence-ring.js (ringLayout, clipLine, edgeColor,
ringLabelPositions). Self center r40, high ring1 r140, medium ring2 r260 (null
lands here), low ring3 r380; even angular spacing with a per-ring stagger, no
overlaps. Dashed ring guides, top-right labels, arrowed edges clipped to node
edges (ally #1D9E75, conflict #E24B4A, defers --line-strong), empty state under
two participants, hover tooltip. New lens-scoped influence color ramp tokens.
Removed the dead seed exports (networkPositions, EDGE_META).

P4 interaction (desktop only). Two pointer gestures by zone: core (<60% r) moves
a node between rings and writes influence {overridden:true} plus
influence_overridden; rim (60-100%) draws a relationship via a three-pill picker
(Ally/Conflict/Defers to) that writes an edge, supports type change and remove,
and prevents duplicates. Escape cancels with no write; the self node never
repositions and has no outbound edge affordance; a press without a drag opens the
node summary. Pointer mapping accounts for the preserveAspectRatio letterbox, and
setPointerCapture/releasePointerCapture are guarded so a capture hiccup never
aborts a gesture (found and fixed during browser QA of the edge gesture).

P5 analytics. trackNetwork in firebase.js fires the five Novus (Pendo) events to
both Firebase Analytics and pendo.track, fire and forget, ids and counts only:
network_viewed, edge_created, edge_deleted, influence_overridden,
influence_inferred. No names, notes, or edge endpoints in any payload.

P6 evals. npm run verify:influence-ring (19, including the 12 spec cases: Suite A
layout 5, Suite B edges 3, Suite C drag 4).

Verification: build clean; prompt mirror in sync; node --check functions OK.
Offline 19/19, influence 7/7, influence-ring 19/19, play 29/29, self 13/13,
onboarding 52/52, resolution 19/19, persistence 24/24, guard 12/12, autoread
10/10, confidence 9/9. Browser QA on local preview (firebase env swapped out then
restored): the ring renders with self centered and nodes on the correct rings by
seeded influence, edges arrowed and colored; a simulated core drag moved Dana
medium to high and it persisted across reload; a simulated rim drag opened the
picker and creating an Ally edge took the count 5 to 6; zero runtime errors on a
clean load (the HMR errors seen mid-session were intermediate edit states, gone
after a fresh build/load). Not touched: People lens, Energy lens, @play, auth,
routing, Firebase init. Shipped on branch feat/influence-ring (stacked on the
prior feat/play-self-onboarding work). Deploy notes appended below.

## 2026-06-06 - Re-add a roster member to a decision (follow up)

Live use surfaced a gap: removing a participant from a decision left no way to add
them back. The People lens only offered "+ Add external", which creates a new
person, so a removed roster member could not return and an external duplicate was
the only path. This corrects the 2026-06-03 "add from roster action is gone"
decision, which assumed the whole roster always stays in every decision.

What changed: replaced the single-purpose AddExternal modal with `AddParticipant`
("Add to decision"). It has two paths: "From this room" lists roster members not
currently in the decision (each re-adds via `store.addParticipant`, which resolves
to the existing record so there is never a duplicate), and "Add someone new" keeps
the external form (`store.addExternal`). The People lens action is now "+ Add
person". Self is re-addable the same way and renders as "You" in the list. Deleted
the now-unused `AddExternal.jsx`. Analytics: `decision_participant_add`
{source: roster}.

Verification: build clean; offline 19/19, play 29/29, self 13/13. Browser QA on
local preview: removed Priya, the Add modal listed her under "From this room"
alongside Chad (a roster member never in this decision), re-added her with no
duplicate and the modal list shrank; removed and re-added "You" with the same
result; external form still present; zero console errors. Shipped on
`feat/play-self-onboarding`; redeployed with the batch below.

Three features in one pass, built in dependency order: self as participant
unblocks the @play "you + 1" floor, and the self model drives the roster polish.

Conflicts resolved (flagged per orchestration step 2, then carried into the
docs). The work order overrides three documented invariants, so the docs were
updated to match rather than blocking: (1) play was documented as "parked", now
@play is a first-class gated command; (2) "new accounts start empty" now also
seeds one self person; (3) Guided Setup's "Skip, I'll set it up myself" door is
removed in favor of a dismiss into the live empty room. The Firestore data model
shape did not change except an additive `isSelf` person flag and the additive
`selfSeeded` user setting; no migration of stored decision shape.

#2 Self as participant. Added `isSelf` to the Person model and the Firestore
round-trip. `store.ensureSelf({name, position})` is idempotent: it guarantees one
self person keyed to `${uid}_self` and, once per account (the `selfSeeded` user
setting), attaches self to every room roster and active decision, migrating
existing accounts. After that one migration, removal sticks. `createRoom` seeds
self into new rooms; new decisions inherit it through the roster. `person-ref.js`
resolves first-person (I, me, my, myself) to the self record before any create,
so the apply path attaches instead of duplicating. The command context flags the
self person and the command system prompt binds first-person to it; prompt bumped
to `room-command-v4-self-2026-06-06` in both `src/` and `functions/`. Self renders
as "You" in People, roster, Energy grid (`chip-self`), and is excluded from "Add
from directory". Local preview seeds one self person; Firestore seeds via
`ensureSelf`.

#1 @play. New `src/lib/play-readiness.js` holds the deterministic gate
(`checkPlayReadiness`): >= 2 participants with self counting, every participant on
a real stance, every non-self participant placed on the grid, network not
required. Reason codes `missing_people` / `missing_stance` / `missing_grid` in
that priority. Blocked path: a deterministic coaching turn names the gap and asks
1 to 2 person-specific questions; the free-text reply routes through the existing
`@map` contract and `applyRoomUpdate`, then readiness is re-checked. Ready path:
calls `/api/generate-play` (no new model path), persists the play as a pinned,
immutable `play` chat message labeled `PLAY · <timestamp>` with the generating
inputs snapshotted (frozen, readable after the room changes), encrypted at rest
in the message body, plus the durable Play doc via `store.savePlay`. Added `play`
to `PERSISTED_MESSAGE_TYPES` so it survives reload. Analytics logs `play_blocked`
{reason} and `play_generated` (counts only, never content). Decision: the coaching
question is deterministic, not a second model surface, consistent with the
`reflectOnAnswer` precedent; the reply parse (the eval target) uses the real `@map`
path.

#3 Onboarding and roster polish. Removed the "Skip, I'll set it up myself" link
entirely. Added a quiet close affordance (`onboarding-close`); dismissing expands
the rail and lands the user in the live empty room (reused or fresh empty room),
never a settings modal. Replaced the lateral `guided-chat-expand` keyframe with a
calm fade-and-rise that reads the same on both doors and respects reduced-motion.
Redesigned "Add from directory" into a roomy list (8px gaps, 14x16 padding, 60px
min row height, a helper line) and excluded self. Event `onboarding_dismissed`
replaces `onboarding_skipped`.

Verification: build clean (existing bundle-size warning only); prompt mirror in
sync; `node --check functions/index.js` OK. Offline eval 19/19, new @play 23/23,
new self 13/13, onboarding 52/52, resolution 19/19, persistence 24/24, guard
12/12, autoread 10/10, confidence 9/9. Browser QA on clean local preview
`http://localhost:5173/#/` (firebase env temporarily swapped out, then restored):
"You" renders first in People with a self tag and as a `chip-self` on the Energy
grid; @play with Priya at unknown stance blocked with a coaching turn naming Priya
and asking how she feels (no play generated); with all stances set @play produced
a pinned PLAY card with all four sections (situation summary, four sequenced
per-person levers, key risk) that persisted across reload; guided setup shows the
close affordance and no skip link, dismiss lands in the live room with no modal;
Room Settings "Add from directory" lists the six directory people roomily and
excludes "You"; zero console errors.

Live eval (gated, real Haiku, ~1 to 2 cents): `@play` generate-play produced a
coherent four-section play grounded in the people, with self in the sequence. The
coaching reply parse extracted "Chad's against it" as `against` (and placed him),
and a messy "could go either way" as `unknown` (defensible). The latter exposed a
loop risk: an honest non-answer leaves stance `unknown`, which the readiness gate
rejects, so the same question could repeat. Fix (option C): added a pure
`nextCoachingStep` that terminates the loop. After two answers that do not close a
stance gap it reads the still-unknown people as neutral with a transparent message
and proceeds; a repeated grid gap points to the Energy lens; a people gap points
to `@add`. Six `verify:play` cases cover it (suite now 29). The three failing
bounded live regression cases were not caused by this change: two are the
unchanged play prompt diverging from strict goldens on `not_generic`, and one is
the command model echoing input words (`aggressive`, `micromanages`) into a note,
not the self line. Offline goldens still 19/19.

Naming: the in-repo user-facing command list (CommandsModal and the chat prompt
chips) now includes `@play`. The external Novus/Pendo in-app guide is not in the
repo; if it lists the command set it needs `@play` added there manually.

Deploy: Firebase Hosting plus Functions plus Firestore rules released to
`the-situation-room-708c6` (functions carry the mirrored
`room-command-v4-self-2026-06-06` prompt). `Deploy complete!`: functions `api`
updated (Node 20 2nd gen), hosting released, rules already current. The only
warning is the known benign build-image cleanup. Live smoke (unauthenticated):
app root HTTP 200, the served asset `/assets/index-kHLVoEym.js` matches the local
build, and `/api/strategist`, `/api/interpret-room-command`, and
`/api/generate-play` all return 401 "Sign in required" (live and auth-gated). The
authenticated `@play` plus `ensureSelf` cold-account smoke needs a sign-in and was
left to the maintainer. Shipped on branch `feat/play-self-onboarding`; main not
yet fast-forwarded, so prod is ahead of main until merge.

## 2026-06-05 - Selected decision survives refresh

Follow up to the browser refresh persistence pass after live QA showed that the
room restored but the selected decision fell back after refresh. No Firestore
schema, encryption, prompt, command contract, or Functions backend changed.

What changed:
- Selecting a decision now writes `#/decision/:decisionId` into the app route,
  giving refresh a synchronous selected-decision source before localStorage,
  IndexedDB cache, or Firestore settings return.
- Decision selection persists the selected decision's own `roomId`, so a stale
  active room value cannot pair the right decision with the wrong room.
- Automatic fallback to the first active decision now waits for the encrypted
  cache in local preview, or for both Firestore user settings and the first room
  snapshot in production. This prevents early default fallback from overwriting
  the selected decision.
- Source-of-truth docs and QA checklists now include the `#/decision/:decisionId`
  reload path.

Verification: `git diff --check` clean; build clean with the existing bundle
size warning; offline eval 19/19, onboarding 52/52, persistence 24/24,
resolution 19/19, guard 12/12, autoread 10/10, confidence 9/9. Browser QA
passed on clean local preview `http://localhost:5186/#/`: created a second
active decision, confirmed selection changed the URL to
`#/decision/deci-1780694727411-a8365820`, hard reloaded, and the second decision
still showed `Position unknown` participant state instead of falling back to the
Salesforce decision. Console errors were zero.

Deployment: Firebase Hosting released
`https://the-situation-room-708c6.web.app`. Direct checks returned HTTP 200 for
the new live assets `/assets/index-YBVObzf1.js` and
`/assets/index-C1BrEGO8.css`.

## 2026-06-05 - Browser refresh restores active room view

Follow up from product review on refresh persistence. No Firestore schema,
encryption, prompt, command contract, or Functions backend changed.

What changed:
- Room view now writes same-browser UI state under
  `situation-room-ui-state-v1`: active room, active decision, and active lens
  (People, Energy, Network).
- On hard refresh, valid same-browser state wins before synced user settings
  finish loading; synced `lastRoomId` and `lastDecisionId` remain the fallback
  for a fresh browser/device.
- Deleted, missing, or archived ids still fall back to the first active decision
  or a quiet no-decision state, and that fallback updates the persisted setting.
- Local preview entry now uses `#/` as the app route, so localhost refreshes stay
  inside the room instead of returning to the landing page. Person and framework
  route hashes continue to reopen directly.
- Source-of-truth docs and QA checklists now include active-lens refresh and
  local-preview route persistence.

Verification: `git diff --check` clean; build clean with the existing bundle
size warning; offline eval 19/19, onboarding 52/52, persistence 24/24,
resolution 19/19, guard 12/12, autoread 10/10, confidence 9/9. Browser QA
passed on clean local preview `http://localhost:5185/#/`: local preview enters
with the app hash and hard reload stays inside the room, Energy reload restores
`app-tab-grid`, Network reload restores `app-tab-network`, the same Network
reload passes at 390px mobile with the burger present, `#/person/marco` reloads
directly to Marco's profile, and console errors were zero.

## 2026-06-05 - Empty decision and guided setup polish

Follow up from product review after the mobile command release. No prompt,
command contract, Firestore rules, data model, or Functions backend changed.

What changed:
- Person profile Driver now renders as a read-only sentence block. It no longer
  opens a textarea or inline editor on click.
- The main workspace no longer duplicates the chat when a room has no decision
  open. The workspace stays blank, the command companion stays hidden on mobile,
  and the chat column owns the `No decision open` copy and locked input.
- The old "Nothing open right now" prompt and the no-decision center card were
  removed. The `Select your room` card is reserved for mobile no-room-selected
  recovery, where the rail is hidden.
- Account menus on desktop and mobile now draw a divider after the Signed in as
  identity block, before Profile and Frameworks.
- Guided Setup now enters with a soft chat-expansion animation from New room, so
  it feels like the chat surface opening into setup instead of a hard panel swap.
- Restoring a saved archived decision now falls back to the first active decision
  or no-decision state, so an archived id cannot reopen as if it were active.

Verification: `git diff --check` clean; build clean with the existing bundle
size warning; offline eval 19/19, onboarding 52/52, persistence 24/24,
resolution 19/19, guard 12/12, autoread 10/10, confidence 9/9. Browser QA
passed on clean local preview `http://localhost:5181/`: Driver has no input or
textarea, desktop and mobile no-decision workspaces are blank with no "Nothing
open right now" prompt, chat shows `No decision open` and `Open a decision
first`, mobile hides the command pill without a decision, desktop and drawer
account menus have the Signed in as divider, Guided Setup uses
`guided-chat-expand` and `guided-panel-fade`, and console errors were zero.

Deployment: Firebase Hosting released `https://the-situation-room-708c6.web.app`
and a direct `curl` check returned HTTP 200 for the fresh assets
`/assets/index-D_LjZQhE.js` and `/assets/index-C1BrEGO8.css`. The Firebase CLI
again printed `Deploy complete!` and then exited nonzero because its local
auth/update-check state is stale; the release itself completed and the live URL
is serving.

QA checklist updated: `docs/qa-mobile-revamp.md` and
`docs/qa-web-parity-profile.md`.

## 2026-06-05 - Mobile command and route chrome polish

Follow up from mobile review. This keeps the command system, prompts,
Firestore rules, and Functions backend unchanged; it is a local UI, docs, and
Hosting release batch.

What changed:
- Mobile command expands to a full-screen command view instead of a bottom sheet.
  Sent prompts render as right-side chat bubbles, assistant results render as
  left-side bubbles, and the temporary thinking state now says `Working on it`
  with animated dots.
- The chat resting state stays conversational and `@read` remains explicit. No
  room, decision, or route selection triggers The Read.
- On Energy and Network, the command entry compresses to a slash-only control
  beside the header actions so it does not cover nodes, axes, legends, or node
  summaries.
- Person, long-notes, and frameworks route pages keep the mobile app header
  (`The Situation Room` plus burger) and render the back control in a separate
  row below it.
- Route pages now replace the lens shell while open instead of layering over
  People/Energy/Network content, so the frameworks page no longer exposes
  person data behind it and the transition is calmer.
- The mobile QA and source-of-truth docs were updated to match the full-screen
  command view, graph-safe command entry, and route chrome behavior.

Verification: `git diff --check` clean; build clean with the existing bundle
size warning; offline eval 19/19, onboarding 52/52, persistence 24/24,
resolution 19/19, guard 12/12, autoread 10/10, confidence 9/9. Browser QA
passed on clean local preview `http://localhost:5179/` at 375px: command panel
fills the viewport, thinking animation appears during send, note result lands as
a left-side chat bubble, no read card appears unless `@read` is sent, Energy and
Network command entries do not overlap graph information, person route chrome is
stable, the drawer opens over route pages, Marco's notes page shows the 15-note
list, frameworks route is generic with no person data in the visible body, and
console errors were zero.

Deployment: Firebase Hosting released `https://the-situation-room-708c6.web.app`
and a direct `curl` check returned HTTP 200 for the fresh asset
`/assets/index-_-8hohjF.js`. The Firebase CLI printed `Deploy complete!` and
then exited nonzero because its local auth/update-check state is stale; the
release itself completed and the live URL is serving.

QA checklist updated: `docs/qa-mobile-revamp.md` and
`docs/qa-web-parity-profile.md`.

## 2026-06-05 - Profile, chat, and person notes follow up

Small local follow up from product review. No prompt, command contract,
Firestore rules, or destructive data behavior changed.

What changed:
- Profile fields are optional. Name can be empty, Position can stay unselected,
  and Email is shown with a small `Read-only` badge instead of helper copy.
- Chat no longer starts as a `Read the room` card. The resting state is a
  conversation prompt with command examples. Selecting or restoring rooms and
  decisions does not trigger The Read. `@read` remains the explicit command that
  runs the grounded read.
- The rail archive disclosure was tightened so it reads as a quiet section, not
  a focused selected row.
- Person surfaces now use one primary profile page. People rows, read chips, and
  graph node summaries open `#/person/:id` directly. The old condensed overlay
  is no longer wired into `Room.jsx`.
- Person pages keep `The Situation Room` visible in the page bar, show the
  driver, the latest two encrypted notes, and visual framework mappings. A new
  `#/person/:id/notes` page holds the long encrypted notes list and returns to
  the profile.
- Local seed data gives Marco 15 notes so the long notes route can be tested.

Verification: build clean; offline eval 19/19, onboarding 52/52, persistence
24/24, resolution 19/19, guard 12/12, autoread 10/10, confidence 9/9. Browser QA
passed on local preview `http://localhost:5177/`: blank Profile saves with no
validation, read-only email badge appears, chat starts as a conversation prompt
with no auto-read message on load, Marco opens as a full person page with the
brand in the page bar, recent notes show two of 15, all notes route shows 15
notes, framework visuals render on desktop and mobile, frameworks reference is
generic, mobile has no horizontal overflow, and console errors were zero.

QA checklist updated: `docs/qa-web-parity-profile.md`.

## 2026-06-05 - Web parity rail cleanup and account profile

Second additive batch on top of the mobile UX revamp. No command model, prompt,
function, trace, privacy, eval fixture, or destructive account action changed.
The goal was parity between web and mobile account access while keeping the web
rail useful.

What changed:
- Desktop rail keeps Rooms and Decisions but now uses one quiet selected-row
  treatment, plain indented decision rows with status dots, and one shared plus
  affordance for New decision and New room. Sign out moved out of the rail.
- Active decisions collapse to the four most recent rows with inline `Show all
  (N)` and `Show less`. If the active decision is older, it remains visible while
  collapsed.
- Web empty states now use one voice: `No decision open` in both the center card
  and chat panel. The locked chat placeholder is short enough to avoid clipping.
  The no-decision card uses normal panel spacing instead of a full-height empty
  well.
- Added a desktop account menu and reused the same account section in the mobile
  drawer: Signed in as, Profile, Frameworks, Sign out. Frameworks routes to
  `#/frameworks` from both platforms.
- Added the shared Profile modal. Name is editable, Email is disabled and
  read-only, Position is required with PM, Engineering, Design, Exec, and Other.
  `store.saveProfile` writes name and position under `users/{uid}` in Firebase
  mode and persists through the encrypted cache in local preview. The saved name
  wins over the Auth display name for greetings.
- Hardened persistence details: live Firestore room snapshots preserve the loaded
  account profile in the store mirror, user settings write nulls when the last
  decision is cleared, and sign-in no longer overwrites an existing saved profile
  name with the Auth display name.

Verification: build clean; offline eval 19/19, onboarding 52/52, persistence
24/24, resolution 19/19, guard 12/12, autoread 10/10, confidence 9/9. Browser QA
passed at desktop and 375px mobile on local preview `http://localhost:5175/`:
rail cleanup, overflow expand/collapse, older active decision visibility,
account menus, Frameworks route, Profile validation/save/reload persistence,
read-only email, mobile drawer parity, and zero console errors.

QA checklist: `docs/qa-web-parity-profile.md`.

## 2026-06-05 - Mobile UX revamp (Tasks 1 to 10)

One batch reworking the mobile surface, with a three-tier person and framework
information architecture applied on every viewport. No change to the LLM command
model (`@note`, `@grid`/`@energy`, `@network`, `@map`, `@create`, `@ask`,
`@read`), the offline eval setup, or trace/privacy defaults. `functions/index.js`
and all prompts/contracts were untouched, so the src/functions mirror stays in
sync.

Conflict resolved (flagged before building, per orchestration step 2): this batch
supersedes two `design-system.md` sections. The mobile bottom-nav with Chat as a
fourth tab is replaced by a slim header, a right burger drawer, a top tab row,
and a floating command companion. The per-row framework "i" popovers and the
"What are these?" disclosure are removed; framework explanation content now lives
only on the Tier 3 /frameworks page. `design-system.md`, `architecture.md`, and
`roadmap.md` were rewritten to match. Scope decision (confirmed with the user):
the new nav chrome is mobile-only (desktop keeps the rail plus chat-column
three-pane layout); the content tiers (Tasks 7 to 10) apply on both viewports.
Tasks 9 and 10 shipped fully, no feature flag.

What changed by task:
1. Autofocus is desktop-only. `useIsMobile` gates the onboarding textareas and the
   companion input; on mobile nothing focuses on load, so the keyboard stays shut.
2. Slim mobile header with a right burger opening `MobileDrawer` (rooms,
   decisions, sign out, via the shared `Rail`). Lens tabs moved to a top row;
   bottom bar removed. Header top-spacing fixed with safe-area padding.
3. Graph fills the full content height below the tab row on its lens.
4. `CommandCompanion`: a fixed (not draggable) bottom-right pill, "Command the
   room", expanding to a bottom sheet that wraps the existing command-first chat
   (placeholder "Command the room, or type /"). All chat behavior and the
   "Grounded in" chips are preserved. Reads as a command surface, not support
   chat. Desktop still uses the chat column.
5. Last room and decision persist to `users/{uid}.settings` via
   `store.setUserSetting` and `repo.getUserSettings`/`putUserSettings`, restored
   once on load. Rooms-but-none-selected shows a closeable "Select your room"
   overlay (drawer or guided setup), then a minimal prompt, never a dead screen;
   no rooms shows the guided-setup entry.
6. Onboarding "Build your first room" top spacing fixed; the skip control is now
   a clearly clickable underlined link (`.onboarding-skip`) with a 40px target.
7. `PersonProfile` is now the Tier 1 condensed overlay only: centered on mobile,
   header plus driver plus last two notes plus state-label framework chips, a
   single quiet /frameworks link, and "View full profile". No per-row "i", no
   tooltip, no popover. `FrameworkVisuals.jsx` (the old per-row "i" component) was
   deleted as dead code.
8. `NodeSummary`: tapping a graph node shows a floating summary (name, decision
   touched, last notes, Power/Interest and SCARF state); tapping it opens Tier 1.
9. `PersonPage` (`#/person/:id`): that person's extended data only, framework
   mappings with the person's mapped state and stored rationale, single quiet
   /frameworks link, no generic prose. Reached from the People tab and "View full
   profile".
10. `FrameworksPage` (`#/frameworks`): generic, person-independent reference for
    all four frameworks. No person data (litmus test passes).

Routing for Tiers 2 and 3 uses the URL hash (no router dependency), so both pages
are linkable and the browser back button works.

Verification: build clean; offline eval 19/19, onboarding 52/52, persistence
24/24, resolution 19/19, guard 12/12, autoread 10/10, confidence 9/9 (all
unchanged). Browser-verified in local preview at 375px: slim header, top tabs, no
bottom bar, full-screen graph, burger drawer with rooms/decisions/sign out, node
summary then condensed overlay (state chips, no "i"), /frameworks and person page
via hash with the back button, command companion opens and closes with the
correct placeholder; zero console errors. Confirmed desktop at 1280px still shows
the rail plus chat-column layout with burger/pill/mobile sign-out hidden. Manual
QA tap-paths in `docs/qa-mobile-revamp.md`.

Files: `src/hooks/useIsMobile.js` (new), `src/components/PersonPage.jsx`,
`FrameworksPage.jsx`, `NodeSummary.jsx`, `MobileDrawer.jsx`,
`CommandCompanion.jsx` (new), `src/components/PersonProfile.jsx` (rewritten),
`FrameworkVisuals.jsx` (deleted), `Chat.jsx`, `OnboardingChat.jsx`,
`src/views/Room.jsx`, `src/lib/store.js`, `src/lib/firestore-repo.js`,
`src/lib/frameworks.js`, `src/styles.css`, the docs set, and
`docs/qa-mobile-revamp.md` (new).

## 2026-06-04 - Mobile shell and Safari sign-in hardened

Changed the mobile app shell from a stacked desktop layout into a fixed-height
mobile workflow. People, Energy, Network, and Chat now appear as bottom app tabs.
Chat is a first-class tab, not a card below the lenses; when selected, it owns
the remaining viewport with a scrolling thread and bottom input. The rooms rail
stays vertical on mobile and ignores a saved desktop collapse state, so mobile
users see rooms and decisions rather than a single-button left rail. The rail is
compact and scrolls inside the viewport. Modals and the person profile now layer
above the bottom tabs.

Hardened Auth for phone Safari. Google sign-in uses redirect on iOS Safari and
falls back to redirect when a popup is blocked. If browser-local persistence is
not available, Auth tries session persistence and then in-memory persistence so
the current session can still sign in. The redirect result is consumed in
`useAuth()` and continues through the existing user-document setup path. No
data-model change.

## 2026-06-04 - Framework popovers finished and mobile tabs pinned

Completed the person-card framework readability pass and the small mobile lens
navigation pass. The four framework rows still keep their existing visual value
chips, but the tappable "i" popovers now use one plain-language sentence each and
reflect mapped values already present in the UI: SCARF dimensions explain the
reassuring move, Thomas-Kilmann styles explain the conflict move, Cialdini levers
explain the influence move, and Fisher and Ury explains how to work from the
underlying interest instead of the stated ask. The copy stays static and frames
the reads as observable behavior and stated positions, not personality typing.
On mobile, the People, Energy, and Network tabs pin to the bottom of the viewport
with compact labels and safe bottom padding so the app reads more like a mobile
workflow. Removed the remaining audit report file and kept the durable record in
the docs. No data-model change and no model calls.

## 2026-06-04 - Frameworks made legible on the person card

The four framework lenses (SCARF, Thomas-Kilmann, Cialdini, Fisher-Ury) showed as
acronyms with a faint, hover-only tooltip that overlapped the labels and was
unreadable on mobile (and was invalid markup: an interactive span nested in the
row button). Replaced it with a real tappable "i" button per row that opens one
plain-language sentence in a persistent popover (click to open, dismiss on
outside click or Escape, one open at a time). The sentence says what the lens
reads about the person and why it helps move them; for Thomas-Kilmann the
popover swaps to the mapped style's action line ("Competing style. Expect them to
push for their position, so come with leverage, not just rapport."). The value
chips are unchanged. Added one "What are these?" disclosure above the rows with
three short lines framing the set as influence and negotiation lenses on
observable behavior and stated positions, not personality typing. The popover is
ink on the overlay surface (legible) and bounded inside the row (left/right 4px)
so it cannot overflow; a mobile cap keeps the floating profile within a 375px
screen. Static copy and UI only: no LLM calls, no data-model change, no
diagnosis. Verified in local preview at desktop and 375px (popover legible and
bounded, "What are these?" renders, zero page overflow, profile width 351px).
Files: `FrameworkVisuals.jsx`, `styles.css`, `docs/design-system.md`.

## 2026-06-04 - Guided Setup as the winning first-run moment (Phases A to E)

Overnight pass to make Guided Setup the first-run win. One commit per phase,
revertable. The retired audit reports (`AUDIT_REPORT*.md`) were removed in this
pass; this log and the `docs/` set are the running record.

Phase A (extraction). The build step produced poor rooms. Fixed at the
extraction layer, still through the existing command pipeline: `deriveDecisionTitle`
strips lead-in filler and caps a short human room name (never the raw paragraph
or a "room" suffix); `decisionSeedNeedsConfirm` and an optional name override
drive a naming confirm; `forceCreatePeople` guarantees every extracted person
from `@create` becomes a participant (no more "No participants"), with apply-time
`resolvePersonRef` still deduping role mentions to existing roster members.

Phase B (voice). Rewrote the three questions in plain, warm language and made the
relationships step skippable. Added a grounded one-sentence reflection between
answers that echoes the user's own words, a brief thinking indicator, an optional
naming confirm, and a specific closing summary. Decision: the reflection is
deterministic, not Haiku-written, to avoid a second model surface that could
hallucinate a fact about a real colleague; the Haiku reflection is flagged as a
deferred enhancement.

Phase C (choreography). First-run opens Guided Setup by default and collapses the
rooms rail; "Open room" and skip expand it again. First-run detection stays robust
via `hasUsableRoom` (a user with real content never sees it). Events:
started/completed/skipped/room_created.

Phase D (one engine, three doors). First-run, "+ New room" (returning-user
framing), and manual share one engine and the one `OnboardingChat` view. "Skip,
I'll set it up myself" now opens the existing Room Settings modal. Flagged: a full
Room.jsx-to-hook extraction is deferred since returning-user guided is a thin
wrapper.

Phase E (live proof). Ran the gated live suite once on real Haiku for a messy
multi-person paragraph: 17/17, 0 flagged, spend $0.0109 (0.02% of the $50
ceiling). Real output matched goldens: room "Get the team to kill the half-built
sales dashboard", four deduped participants (Robert kept distinct, role-only
mentions labeled by role, no phantom), banded Energy (60 to 80, no extremes),
exactly the two stated edges (defers to Robert, one conflict), specific closing.
Observed and flagged (eval NOT loosened): the model set Energy in the `@create`
pass and returned the separate `@grid` pass without person references, so that
pass was a no-op; the end state is correct, but the redundant grid pass is a
candidate to tighten or drop. Checks: onboarding verify 52/52, offline eval 19/19,
resolution 19/19, guard 12/12, persistence 24/24, autoread 10/10, confidence 9/9,
build clean, function syntax OK. No prompt changes, so the src/functions mirror is
untouched. Haiku-only, no raw prod traces, encryption and scoped rules intact.

## 2026-06-04 - First-run guided onboarding, local only

Added a first-run onboarding conversation for new accounts. Email registration
and first Google sign-in set a one-shot local marker; existing users do not see
onboarding on every arrival. Empty states keep a manual Start guided setup path.
The onboarding asks three deterministic questions (decision and outcome, 2 to 4
people, relationships), creates the room and decision, then routes answers
through the existing `@create`, `@energy` (`grid` internally), and `@network`
pipeline. There is no second interpreter and no new calibration logic. Added
`OnboardingChat`, `lib/onboarding.js`, `npm run verify:onboarding`, and mocked
onboarding fixtures. Checks: onboarding 19/19, persistence 24/24, offline eval
19/19, function syntax OK, build clean. Deployed Firebase Hosting to
`https://the-situation-room-708c6.web.app`; the live URL returns HTTP 200.
Note: the Firebase CLI released Hosting but exited 2 afterward because local
Firebase credentials need reauth and the CLI update-check config is not writable.

## 2026-06-04 - Fix: strategist response quality (concise, hint when thin)

From the live screenshot and local traces the strategist read was too extensive,
returned moves even when declining, and once slipped an em dash past the
"no em dash" rule. Note on retrieval: production stores trace metadata only (raw
off by default for privacy), so the exact prod prompt/response was not retrievable;
this was driven by the visible response and the local Phase D traces. Tightened the
prompt to `strategist-v3`: two to four sentences, at most three one-sentence moves,
no padding, and when the room is too thin for a confident play, ask one focused
question or name what to map next instead of forcing a play. Added a deterministic
safety net in `normalizeStrategistAnswer` (both src and functions): strip em/en
dashes, and force an empty moves array on a decline. No new eval/clarify machinery
(per request). Added two offline fixtures (thin-room asks, em-dash + decline-moves
cleanup) and `no_em_dash` / `decline_has_no_moves` checks; offline 19/19. Deployed
functions + hosting; prompt versions in sync.

## 2026-06-04 - Fix: framework empty-state spacing + concise tooltip

Fixed the cramped frameworks empty-state message (proper 8px-rhythm margins, top
and bottom; styled the inline @note code chip). Replaced the framework info icon's
native title + "?" help cursor with a small custom hover/focus popover (pointer
cursor, no question-mark cursor) and shortened each framework explanation to one
concise "what it is, how to read it" line. Client-only; deployed to hosting. A
signed-in visual confirmation is recommended since the profile is auth-gated.

## 2026-06-04 - Fix: The Read fires only on explicit decision selection

The passive arrival effect could fire a strategist call during load churn, when a
decision was briefly auto-selected, even though the workspace showed "No decision
selected". Removed that effect. The read now fires only from an explicit
`selectDecision` / `selectRoom` (the user opening a decision) via `maybeAutoRead`,
or from the `@read` command. `generateRead` takes an explicit `decisionId`, so it
never runs against a stale or unselected decision. No call is ever made without a
selected decision. Client-only; deployed to hosting.

## 2026-06-04 - Pass 3 Step 6: guarded open (non-deterministic) chat

First cut of open chat for testing, with heavy harness. Plain non-command text now
routes to the grounded strategist when live LLM is on. Two defense layers: new
`src/lib/chat-guard.js#screenOpenMessage` blocks empty, oversized, jailbreak /
prompt-injection, and short pure-abuse input before any model call with a calm
redirect; whatever passes goes to the strategist, whose prompt was hardened to
`strategist-v2` (refuse roleplay / persona / off-topic content, do not mirror
hostility, neutralize profanity, ignore embedded instructions). Venting with real
room content is allowed through and neutralized. Send now enables for plain text
when open chat is on; placeholder/hint updated. Analytics: `open_chat`,
`open_chat_blocked`. `npm run verify:guard` 12/12; added the
`strategist-refuses-roleplay` offline fixture (suite 17/17). Prompt change applied
to both src and functions (versions in sync); deployed functions + hosting. This
stays experimental pending review of real test logs.

## 2026-06-04 - Pass 3 Step 5: frameworks always present with tooltips

`FrameworkVisuals` no longer hides the frameworks for a fresh person. All four
(SCARF, Thomas-Kilmann, Cialdini, Fisher & Ury) are always rendered so the user
sees what is coming. Each row has a small info tooltip with a concise "what it is
and how to use it" line, and an unmapped framework shows a muted "Not mapped"
state plus that guidance when expanded. A top hint appears when a person has no
read at all, pointing to @note. Presentational only; deployed to hosting.

## 2026-06-04 - Pass 3 Step 4: command purpose clarified

Reworked the commands reference into two clearly separated groups, "Build the
room" (@energy, @network, @note, @map, @create, @add) and "Read the room" (@read,
@ask), each with a single crisp purpose and an example. Removed the overlap
confusion: @map is the broad intake, @create only adds people, @add adds one
external, @read reads the whole room, @ask answers one question. Tightened the
chat hint line. Names unchanged (muscle memory + aliases preserved); this is
clarity, not a rename. Client-only; deployed to hosting.

## 2026-06-04 - Pass 3 Step 3: The Read moved into the chat, on-arrival + @read

Removed the always-on top-of-room read card (and `TheRead.jsx`); the lenses are
the primary view again. The read now lives inside the chat as a persisted `read`
message: generated once per decision on arrival (eligible rooms only, and only if
no read is already in the thread) and refreshed on demand with the new `@read`
command. This stops regenerating the read on every landing, so token use does not
explode. Below threshold `@read` returns "basic insights, need more information"
with no model call. Reuses the strategist endpoint/grounding (no new model path).
The read renders with clickable Grounded-in person chips (CoachMessage now takes
`onCiteClick`). Client-only; deployed to hosting. Build OK, offline 16/16, all
verifies green.

## 2026-06-04 - Pass 3 Step 2: robust person resolution

Fixed the @note bug where "@note the head of sales is..." matched only the first
word ("the") and failed. `@note` now uses `splitLeadingPersonRef`: the longest
leading phrase that resolves exactly (name or role) is the target, the rest is the
note. Generalized `resolvePersonRef`: bidirectional role abbreviations (CPO <->
chief product officer), trailing-noun aliases ("head of sales" answers to
"sales"), generic leader phrases ("the boss"/"person in charge" -> the CEO), and
conservative typo tolerance (Levenshtein, unique only: "Roven" -> Rouven). An
`exactOnly` mode keeps sentence splitting from being swallowed by substring role
matches. `npm run verify:resolution` 19/19; offline 16/16; persistence 24/24.
Client-side only; deployed to hosting.

## 2026-06-04 - Pass 3 Step 1: docs consolidated, LLM pipeline documented

Retired the audit-report pattern. Consolidated the two passes into a single concise
`AUDIT_REPORT.md` (what happened, what changed, current state) and deleted
`AUDIT_REPORT_2.md`; the running record is this log and the `docs/` set. Added
`docs/llm-pipeline.md` as the definitive AI reference: the two model surfaces, the
end-to-end request path, prompts/contracts, the src-vs-functions sync rule, and
MLOps (offline-first evals, local vs production traces, the $50 cost ceiling,
deploy). Added it to the CLAUDE.md read list and pointed architecture.md at it.

## 2026-06-04 - Pass 2 FINAL: deployed live

Deployed Firestore rules, hosting, and functions to `the-situation-room-708c6`.
Live smoke confirms the strategist endpoint is live and secured: the app returns
200 and `POST /api/strategist` returns 401 "Sign in required" (not 404). The
`messages` subcollection rule and the calibrated/strategist function code are now
in production. Wrote the executive summary at the top of `AUDIT_REPORT_2.md`.
Flagged for the user: the Node 20 functions runtime is deprecated (decommission
2026-10-31, bump engines before then) and a benign build-image cleanup warning.
This closes the second overnight pass.

## 2026-06-04 - Pass 2 Phase D: gated live eval on real Haiku

Ran the gated live suite once (EVAL_ALLOW_LIVE=true, bounded by EVAL_CASE_IDS) for
banded calibration, single-statement->one edge, @ask grounding, off-topic decline,
and the Auto-Read: 5/5 pass on real Haiku. Actual outputs: "very low interest"
-> interest 15 (banded, not 0); "Maya reports to Sam" -> exactly one defers edge;
strategist cited only room people and declined the off-topic request
(grounded=false). No prompt misbehavior; no eval loosened. Spend $0.0519 total
(0.1% of the $50 ceiling). Fixed a setup gotcha: an empty ANTHROPIC_API_KEY in the
shell env shadowed .env.local (Vite loadEnv prefers process.env); sourcing
.env.local into the dev server fixed it (no code change).

## 2026-06-04 - Pass 2 Phase C: low-confidence visual honesty

Persisted the interpretation-layer `confidence` onto `decision.placements[id]`
(now `{power,interest,confidence}`) via a new pure `lib/placement.js`
(`buildPlacement`, `placementNeedsConfirm`, default high). Additive and backward
compatible: legacy placements read as high, no migration; a manual grid drag
resets to high. `store.setPlacement` takes an optional confidence; `Room.jsx`
passes the command's confidence through; Firestore round-trips it with no repo
change. The Energy lens renders a dashed needs-confirm ring on low-confidence
chips. `npm run verify:confidence` 9/9; offline suite 16/16.

## 2026-06-04 - Pass 2 Phase B: auto-surfaced the strategist

Made the strategic read the centerpiece without a new lens or model path. Added
two first-class `@ask` prompt chips. Added "The Read" card (`TheRead.jsx`) at the
top of the room: shows when a decision has >= 4 participants and >= 2 edges, calls
the existing strategist endpoint with a fixed internal question, and renders a
one-sentence read, up to three moves, and clickable "Grounded in" person chips.
Cached by `autoReadSignature` (grid/positions/edges/confidence) so a model call
fires only when the strategic inputs change; below threshold it shows a calm
prompt, never a blank. Reuses the Phase-7 grounding and banned-trait guard.
Analytics: `read_generated`, `read_shown`, `read_chip_clicked`. Offline suite
16/16 (added `strategist-auto-read` + `requireMoves`); `npm run verify:autoread`
10/10 for the threshold and cache-bust. Docs/architecture updated next phase.

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

# Resolution log

Project memory. Append a dated entry per task. Newest at the top. Do not delete
entries; correct them with a follow up that references the original.

---

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

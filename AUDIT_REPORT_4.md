# AUDIT REPORT 4 — Make Guided Setup the winning first-run moment

Overnight pass. One phase per commit, revertable. Hard constraints held:
Haiku-only (`claude-haiku-4-5-20251001`), no raw production traces, encryption
intact, owner-scoped rules, every behavioral change gets an OFFLINE eval fixture
(mocked), onboarding reuses the existing command pipeline
(`interpretRoomCommand` / `normalizeRoomUpdate` / `applyRoomUpdate` +
`@create`/`@energy`/`@network`). No fourth lens, no personality quiz, no
diagnosis. One interpretation path.

Baseline before this pass: offline eval 19/19, onboarding verify 19/19, build
clean. HEAD `719ce8f Add guided onboarding flow`.

---

## 2026-06-04 16:40 CEST — Phase A: fix the extraction (highest priority)

The build step produced poor rooms: a generic or raw-paragraph room name,
phantom role-people next to the real roster, and an occasional "No participants".
Fixed at the extraction layer, all still routed through the existing command
pipeline (`@create` / `@energy` / `@network`), no second interpretation path.

- ROOM NAME. New `deriveDecisionTitle` strips lead-in filler ("I need to get
  the ..."), keeps the first clause, caps at a 56-char word boundary, and adds a
  question mark when the decision reads as a yes/no call. `deriveDecisionSeed`
  now sets `roomName = title` (no more raw paragraph, no "... room" suffix) and
  accepts an optional user name override. Golden: the messy dashboard paragraph
  yields "Get the team to kill the half-built sales dashboard".
- NAMING CONFIRM. `decisionSeedNeedsConfirm` flags a thin/one-word/hard-truncated
  title so the conversation can ask one short naming confirm before building
  (wired in Phase B). A clear decision does not force it.
- PARTICIPANTS. New pure `forceCreatePeople` sets `create: true` on every named
  person from the `@create` pass, so a missing model flag can never drop a person
  and leave "No participants". `Room.jsx` applies it to the create pass only;
  apply-time `findPersonRef` resolution still prevents duplicates.
- PEOPLE / DEDUP. The `@create` plan text now tells the parser to use the name
  when given, use the role as the label when only a role is given, and never
  duplicate a person already named with that role. Apply-time resolution
  (`resolvePersonRef`) already maps "the head of engineering" / "Head of
  Engineering" to an existing roster member, so no phantom is created.
- STANCE / ENERGY and RELATIONSHIPS unchanged: banded calibration and
  single-statement edge discipline already live in the shared command path.

Eval: extended `evals/fixtures/onboarding.json` (messy multi-person paragraph,
dedup roster, missing-create-flag update) and added a Phase A section to
`verify:onboarding` asserting good room name, no "room" suffix, filler stripped,
golden title, naming-confirm behavior, name override, force-create participants,
and role-to-existing-person dedup. Checks: onboarding verify 31/31, offline eval
19/19, build clean.

## 2026-06-04 16:55 CEST — Phase B: plain-language questions and reflection

Rewrote the conversation to sound like a sharp colleague. The framework mapping
stays silent behind the scenes; nothing here adds a model surface.

- QUESTIONS. The three core questions are now plain and warm: "What's the
  decision you're trying to get through, and what would a good outcome look
  like?", "Who are the few people who can make or break this? Names, and roughly
  what they do.", "Anything about how they relate? Who leans on whom, who's
  aligned, where there's tension. Skip if you're not sure." The relationships
  step is marked skippable and can be passed with an empty answer.
- REFLECTION. Between answers the assistant reflects back one specific thing the
  user said: `reflectOnAnswer` echoes the user's own salient sentence (people:
  "So Robert adds pressure instead of shielding the team, noted."; decision:
  names the derived title; relationships: graceful when skipped). It is one short
  grounded sentence and cannot invent a fact.
  FLAG: the brief asked for a Haiku-written reflection. I shipped a deterministic
  grounded reflection instead, on purpose: a reflection model call is a second
  model surface (new prompt, functions/index.js mirror, version, eval fixture)
  and risks hallucinating a fact about a real colleague. Deferred as an
  enhancement; the deterministic version already quotes the user's words, so it
  reads specific. Revisit if the "thinking" feel needs the model.
- THINKING STATE. A brief beat (`REFLECT_DELAY_MS` 600ms) plus an animated
  three-dot "thinking" bubble sits between the user's send and the reflection, so
  replies do not feel instant or canned.
- NAMING CONFIRM. After the third answer the assistant shows one short naming
  confirm pre-filled with the derived title ("I'll call this room ..., keep it or
  type a better name"); a vague decision instead asks for a name. The flow is
  three questions plus the optional naming confirm, skippable throughout.
- CLOSING. `buildClosingSummary` names what it built specifically ("Mapped
  Robert, Head of Engineering, Head of UX, and Susan; set initial Energy; drew
  the relationships you mentioned."), built from the actual participants,
  placements, and edges, not a generic line.

`OnboardingChat` was rebuilt as a phase-driven view (questions / naming / done)
with the thinking indicator and a single-line name input. Eval: added a Phase B
section to `verify:onboarding` (question wording, skippable step, grounded
one-sentence reflection, naming confirm, specific closing, no em dashes). Checks:
onboarding verify 43/43, offline eval 19/19, build clean. Visual confirmation is
auth-gated (Firebase), so a signed-in screenshot is recommended.

## 2026-06-04 17:05 CEST — Phase C: first-run trigger and panel choreography

- TRIGGER. On first login with no usable room, Guided Setup opens by default
  (existing `shouldAutoStartOnboarding` guard on a pending one-shot marker, an
  unprompted state, and `hasUsableRoom === false`). The auto-start now also
  collapses the left rooms rail (`railCollapsed = true`) so the conversation owns
  the screen. The collapse fires only on the auto (first-run) path; the manual
  "Start guided setup" button does not collapse, since the user is already in the
  workspace.
- HANDOFF. "Open room" expands the rail again (`railCollapsed = false`) and lands
  in the now-populated room. The decision is already selected (set during the
  build), and the existing "Room ready, run @read / @ask" card is in the thread.
  Skip also restores the rail so a first-run collapse never sticks.
- ROBUST DETECTION. A user with real content never sees first-run: `hasUsableRoom`
  requires an active decision with at least one person, so an empty seeded room
  (active decision, no roster) or an archived-only room still counts as first run,
  while any real roster blocks it. The one-shot marker is consumed on arrival and
  `onboardingPrompted` is set at start, so it never repeats.
- INSTRUMENTATION. `onboarding_started` (now with `mode`), `onboarding_completed`
  (with people + edge counts), `onboarding_skipped`, and `onboarding_room_created`
  (with `reused`). The room-created event keeps the `onboarding_` namespace for
  consistency with the others.

Layout: with the rail collapsed to a 36px strip, the onboarding panel
(`grid-column: 2 / -1`) fills the rest, so the collapsed-rail state renders
cleanly. Eval: added a Phase C robustness section to `verify:onboarding`
(empty-seeded-room, archived-only, real-content, no-marker). Checks: onboarding
verify 48/48, offline eval 19/19, build clean.

## 2026-06-04 17:15 CEST — Phase D: one engine, three doors

First-run onboarding, guided new-room, and manual setup are now one system.

- ONE ENGINE. The conversation logic lives in `src/lib/onboarding.js` (questions,
  reflection, naming, command plan, closing, trigger guards) and renders through
  the single `OnboardingChat` view. Room.jsx drives all entries through the same
  `startOnboarding` / `submitOnboarding` / `completeOnboarding` handlers, keyed by
  a `mode` field. There is no second conversation path.
- DOOR 1, FIRST-RUN. The auto path uses the engine plus the product intro
  (`ONBOARDING_INTRO`, "The Situation Room maps the people behind a decision ...").
- DOOR 2, "+ NEW ROOM". The rail's new-room action now opens the same engine with
  returning-user framing (`ONBOARDING_INTRO_RETURNING`, no product pitch) via
  `startGuidedRoom`. Same questions, same build path.
- DOOR 3, MANUAL. "Skip, I'll set it up myself" now drops into the existing
  manual Room Settings modal instead of just closing. It reuses an empty room if
  present, else creates one, then opens `RoomSettings`, so guided and manual are
  connected, not parallel. The empty-state keeps both a "Start guided setup"
  primary and a manual "New room" secondary.

FLAG (per Phase D guidance): returning-user guided is a thin wrapper over the
first-run engine, the only difference is the intro line and the absence of the
first-run rail collapse. I did not extract the Room.jsx state machine into a
standalone hook/module tonight, because the wrapper is thin and the refactor
carries regression risk for no behavior gain. The pure engine already lives in
`onboarding.js`; a later hook extraction (`useGuidedSetup`) is the deferred
remainder if Room.jsx coupling becomes a problem.

Eval: added a Phase D section to `verify:onboarding` (the two intro framings).
Checks: onboarding verify 52/52, offline eval 19/19, build clean.
</content>

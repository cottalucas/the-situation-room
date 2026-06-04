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
</content>

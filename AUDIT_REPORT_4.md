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
</content>

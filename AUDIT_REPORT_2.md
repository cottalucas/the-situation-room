# Audit Report 2: Make the strategist the spine

Second overnight pass. Verify the previous pass against persistence, then make the
strategist first-class. One section per phase, appended with timestamps, committed
separately so each is revertable.

> Status legend: PASS / FAIL (verified assertions), FIXED, FLAGGED (left for your
> review), BLOCKED (could not run in this environment, documented + runnable).

## Environment facts (this run)
- Node v18.20.6, Firebase CLI 13.35.1, logged in as the project owner.
- **No Java runtime** -> the Firestore emulator cannot start here. The
  transport-level persistence test is written and runnable, but BLOCKED here.
- `.env.local` IS fully populated: real Firebase web config (project
  `the-situation-room-708c6`), `VITE_ENABLE_LIVE_LLM=true`, a real
  `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL=claude-haiku-4-5-20251001`. (An early
  check in this run misread it as empty because it only listed key names; the
  values are present.) So **live Anthropic calls and deploy are possible**; the
  key stays gitignored and is never printed or committed.
- Node has Web Crypto, so the encryption layer is fully testable in Node.

Nothing was faked: every result below is either a real run or explicitly marked
BLOCKED with the exact blocker and a runnable command.

---

## EXECUTIVE SUMMARY

_Filled at the end of the run._

---

## PHASE A — Verify persistence + anaphora

Timestamp: 2026-06-04

### Approach
The previous pass shipped persistent chat, the context window, and `@ask` but
never exercised them. I verified the real code paths the features depend on, in
two layers:
1. **Logic layer (ran here, Node):** `npm run verify:persistence`
   (`scripts/verify-phase-a.mjs`) drives the real `crypto.js`, the real
   `firestore-repo` message converters, the snapshot sort, the extracted anaphora
   resolver, and `compactRoomCommandContext`.
2. **Transport layer (BLOCKED here):** `npm run verify:emulator`
   (`tests/emulator/persistence.emulator.test.mjs`) writes encrypted messages to
   the emulator, reads them back through the live SDK, and asserts decrypted
   rehydration in order. Requires the Firestore emulator, which requires Java.

To make the anaphora resolution testable without React/the store, I extracted the
pure reference resolver from `Room.jsx` into `src/lib/person-ref.js`
(`resolvePersonRef` plus `firstName`/`normalizeRef`/`roleAliases`). `Room.jsx` now
imports it. No behavior change; build and offline evals stay green.

### Results — logic layer (24/24 PASS)
- **Crypto round-trip — PASS.** Free text (including unicode and 500-char) encrypts
  to `iv:ct` and decrypts back; empty string passes through. This is the
  "free text decrypted correctly" guarantee.
- **Message converter round-trip — PASS.** Using the actual
  `messageToFirestore` / `messageFromFirestore`: `body` and `questions` are
  encrypted at rest; `cites`, `grounded`, `type`, `label`, `personName`, `command`
  stay plaintext; everything decrypts back to the original on read. This is the
  exact code a reload uses to rehydrate.
- **Thread sort — PASS.** `messagesFromSnap` orders oldest-first and places a
  pending (unresolved `serverTimestamp`) write last.
- **Anaphora resolver — PASS.** "Maya" / "maya" / the stable id all resolve to the
  existing person (no duplicate); an unknown name ("Diana") resolves to null (the
  command path then skips rather than duplicating); a bare pronoun ("she") resolves
  to null in the write layer, which is correct: the pronoun must be resolved by the
  model using `recentTurns`, not guessed deterministically.
- **Context assembly — PASS.** After "Maya reports to Sam", the next call's
  `recentTurns` contains that prior turn and the room snapshot contains Maya and
  Sam, so the model has exactly what it needs to bind "she" -> Maya and emit a
  position write for the existing person.

### Results — transport layer (BLOCKED)
`npm run verify:emulator` could not run:
`Error: Process 'java -version' has exited with code 1. ... Unable to locate a
Java Runtime.` The harness is written and wired (`firebase.json` emulators block +
npm script) and uses a demo project id (no creds, no billing). Run it where Java
is installed to get the network-level reload proof. The logic it would exercise
(converters, sort, decrypt) is already PASS above; the only unverified slice is the
literal Firestore SDK transport.

### Bugs found
None. The previous pass's persistence and anaphora logic is correct under test.
The one true gap was that it was untested; that gap is now closed at the logic
level and scripted at the transport level.

### Constraint check
Haiku-only untouched, no traces written, encryption verified intact (it is the
thing under test), rules unchanged. Build OK, offline evals 15/15,
`verify:persistence` 24/24.

---

## PHASE B — Auto-surface the strategist

Timestamp: 2026-06-04

Made the strategic read the centerpiece without adding a lens or a new model path.

### 1. Discoverability
Added two first-class `@ask` chips to the always-present prompt chip row
(`EXAMPLE_PROMPTS`): "@ask who should I talk to first?" and "@ask what am I
missing?", alongside the existing command chips. `@ask` is no longer modal-only.

### 2. The Read (Auto-Read card)
- New `src/components/TheRead.jsx`, rendered at the top of the room above the lens
  tabs, reusing card styling.
- Eligibility: shows only when the decision has >= 4 participants AND >= 2 edges
  (`autoReadEligible`). Below threshold it shows the calm prompt "Map a few more
  people and relationships and I'll find the play." — never a blank card.
- It calls the EXISTING strategist endpoint (`askStrategist`) with a fixed
  internal question ("the single most important thing I am missing... who to move
  first"). No new model path; the Phase-7 grounding, cite-to-room, and
  banned-trait guard apply unchanged.
- Output: one-sentence read + up to 3 moves + "Grounded in <names>" where each
  name is a clickable chip that opens the person's compact profile.
- Caching / cost: the result is cached by `autoReadSignature`, which is built from
  grid placements (incl. confidence), positions, and edges. A model call happens
  only when those strategic inputs change; title or note edits do not bust it, and
  there is no call on every render. On error or with live LLM off, the card stays
  quiet rather than showing a broken state.

### 3. Instrumentation
Through the existing analytics path: `read_generated` (when a fetch starts),
`read_shown` (when a ready read renders), `read_chip_clicked {personId}` (chip
click).

### Offline evals
- `strategist-auto-read` fixture: the fixed Auto-Read question over a 4-person /
  2-edge room must cite only room people, produce moves, and surface the two
  highest-power people. Added a `requireMoves` check to the strategist scorer.
  Offline suite now 16/16.
- `npm run verify:autoread` (`scripts/verify-phase-b.mjs`): 10/10 covering the
  >=4/>=2 threshold (below -> empty state) and the cache-bust signature (busts on
  placement/position/edge/confidence change, stable on title change).

### Verification note
Build clean; offline + threshold tests pass. A signed-in browser smoke of the
live card was not run here because the app gates on real Firebase Auth (no
interactive sign-in available in this environment); the live strategist path
itself is exercised in Phase D.

---

## PHASE C — Low-confidence visual honesty

Timestamp: 2026-06-04

Persisted the interpretation-layer `confidence` onto the stored placement and
surfaced it on the Energy lens, so the product shows when it is uncertain instead
of faking precision.

### Changes
- `src/lib/placement.js` (new, pure): `buildPlacement(power, interest, confidence)`
  returns `{ power, interest, confidence }` with `normalizeConfidence` defaulting
  anything missing or invalid to `"high"`. `placementNeedsConfirm` is true only for
  `"low"`.
- `store.setPlacement` now takes an optional `confidence` and stores it via
  `buildPlacement`. `decision.placements[id]` is now
  `{ power, interest, confidence }`. Additive and backward compatible: legacy
  placements with no confidence read as high, so no migration. A manual grid drag
  (no confidence passed) resets to high, which is the right "I confirmed this"
  signal.
- `Room.jsx` passes the command's `item.confidence` into `setPlacement`, so a
  low-confidence read from `@energy`/`@map` is both placed and flagged.
- `firestore-repo` needed no change: placements are stored and read as a plain
  map, so `confidence` round-trips to Firestore automatically.
- Energy lens: `GridTab` passes `needsConfirm` to `Chip`, which renders a dashed
  lighter ring and a "low confidence, confirm" tooltip on low-confidence chips.

### Offline check
`npm run verify:confidence` (`scripts/verify-phase-c.mjs`): 9/9 — low confidence is
carried into the stored shape with power/interest intact, explicit high stays
high, missing/garbage confidence defaults to high, legacy `{power,interest}` reads
as confident, and only `"low"` needs confirm.

### Constraint check
Haiku untouched (no model change), encryption intact (placements stay plaintext,
as they must to render and query — the encrypted fields are unchanged), rules
unchanged. Build clean; offline suite 16/16; A/B/C verify 24/10/9.

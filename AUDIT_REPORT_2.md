# Audit Report 2: Make the strategist the spine

Second overnight pass. Verify the previous pass against persistence, then make the
strategist first-class. One section per phase, appended with timestamps, committed
separately so each is revertable.

> Status legend: PASS / FAIL (verified assertions), FIXED, FLAGGED (left for your
> review), BLOCKED (could not run in this environment, documented + runnable).

## Environment facts (this run)
- Node v18.20.6, Firebase CLI 13.35.1, logged in as the project owner.
- **No Java runtime** -> the Firestore emulator cannot start here.
- `.env.local` has **empty** Firebase web config and an **empty**
  `ANTHROPIC_API_KEY` -> no live Firestore and no live Anthropic calls here.
- Node has Web Crypto, so the encryption layer is fully testable in Node.

These bound what could be executed live (see Phase A transport, Phase D, and the
deploy step in FINAL). Nothing was faked: every result below is either a real run
or explicitly marked BLOCKED with the exact blocker and a runnable command.

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

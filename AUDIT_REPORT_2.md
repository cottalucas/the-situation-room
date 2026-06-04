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

Timestamp: 2026-06-04 (overnight run, deployed live)

Verified the previous pass, then made the grounded strategist the product's spine,
proved it on real Haiku, and deployed everything live. Committed per phase,
revertable.

### What was verified
- **Persistence + anaphora (Phase A): no bugs found.** The real crypto, the real
  `firestore-repo` message converters, the snapshot sort, the extracted anaphora
  resolver, and the context assembly pass 24/24 in Node
  (`npm run verify:persistence`). Free text encrypts and decrypts back, the thread
  rehydrates in order, names/ids resolve to the existing person (no duplicate), and
  a bare pronoun is left for the model to bind via `recentTurns` (which carry the
  prior turn). The one real gap was that it was untested; that is now closed.

### What changed
- **Strategist auto-surfaced (Phase B):** first-class `@ask` prompt chips and an
  always-on "The Read" card at the top of the room. It reuses the existing
  strategist endpoint with a fixed question once a decision has >= 4 people and
  >= 2 edges, shows a read + up to 3 moves + clickable "Grounded in" person chips,
  and caches by a grid/positions/edges signature so a call fires only when the
  strategic inputs change. Analytics: `read_generated`, `read_shown`,
  `read_chip_clicked`. No new model path; Phase-7 grounding and banned-trait guard
  reused.
- **Low-confidence visual honesty (Phase C):** `confidence` is now persisted on
  `placements[id]` (additive, defaults high, no migration) and the Energy lens
  renders a dashed needs-confirm ring on low-confidence chips.

### What was proven live (Phase D)
5/5 on real Haiku: "very low interest" -> 15 (banded, not 0), "Maya reports to
Sam" -> exactly one defers edge, `@ask` grounded to room people, off-topic
declined (`grounded=false`), Auto-Read grounded. No prompt misbehavior; no eval
loosened. Spend **$0.0519** total (0.1% of the $50 ceiling).

### Deployed live
`firebase deploy` of Firestore rules, hosting, and functions to
`the-situation-room-708c6`. Live smoke: `https://the-situation-room-708c6.web.app`
returns 200; `POST /api/strategist` returns 401 "Sign in required" (not 404),
confirming the new strategist endpoint is live, routed, and auth-secured.

### What I could NOT safely auto-fix / flagged
1. **Firestore emulator transport test — BLOCKED (no Java here).** The harness is
   written and wired (`npm run verify:emulator`); run it where Java is installed
   for the network-level reload proof. The logic it covers already passes.
2. **Browser smoke of The Read not run here.** The app gates on real Firebase Auth
   and there is no interactive sign-in in this environment. The live function is
   smoke-verified (401) and the card logic is unit-tested; a manual signed-in
   visual check of the card and the dashed dot is the remaining confirmation.
3. **Functions runtime Node 20 is deprecated** (decommission 2026-10-31). Deploy
   still works; bump `functions/package.json` engines before then.
4. **Build-image cleanup warning** during functions deploy (small possible GCR
   bill). Redeploy or delete the images in the console to clear it.
5. **Local dev gotcha (fixed in-run, no code change):** an empty
   `ANTHROPIC_API_KEY` exported in the shell shadowed `.env.local` because Vite
   `loadEnv` prefers `process.env`. Source `.env.local` (or unset the empty var)
   when running the dev server for live calls.

### Constraint confirmation
- **Haiku only:** `claude-haiku-4-5-20251001` everywhere, including the strategist
  and Auto-Read. No Sonnet/Opus path.
- **No raw production traces:** `LLM_STORE_RAW_TRACES=false` default; the live
  traces this run were the local bridge only (gitignored).
- **Encryption intact:** verified by test; chat free text and the existing
  encrypted fields are unchanged; placements stay plaintext as required to render.
- **Rules scoped:** owner-scoped throughout; the `messages` subcollection rule is
  deployed.
- **Offline evals pass:** 16/16; plus `verify:persistence` 24/24,
  `verify:autoread` 10/10, `verify:confidence` 9/9.

### How to run / deploy
`npm run eval` (offline). `npm run verify:persistence` / `verify:autoread` /
`verify:confidence`. `npm run verify:emulator` (needs Java). Live eval (gated):
source `.env.local`, `npm run dev`, then
`EVAL_ALLOW_LIVE=true EVAL_BASE_URL=http://localhost:5173 npm run eval:live`.
Spend: `npm run trace:summary`. Deploy:
`firebase deploy --only firestore:rules,hosting,functions`.

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

---

## PHASE D — Prove it live (gated, real Haiku)

Timestamp: 2026-06-04

Ran the gated live suite once against real Haiku through the local Vite endpoints
(`EVAL_ALLOW_LIVE=true`, bounded with `EVAL_CASE_IDS` to the requested cases to
keep spend minimal). Setup note: an empty `ANTHROPIC_API_KEY` in the shell env was
shadowing the `.env.local` value (Vite `loadEnv` prefers `process.env`); sourcing
`.env.local` into the dev server's environment fixed it. No code change.

### Result: 5/5 passed. Actual Haiku output vs golden expectations:
| Case | Expected | Actual Haiku output | Verdict |
|---|---|---|---|
| Banded calibration ("very low interest, very high power") | interest in 10-20 (not 0), power in 85-95 | `power=90, interest=15` | PASS — banded, no extreme |
| Single statement -> one edge ("Maya reports to Sam") | exactly 1 defers edge | `1 edge: maya>sam:defers` | PASS — no fabrication |
| @ask grounding ("who first") | cites only room people, has moves | `grounded=true, cites=[rouven,chad,raluca], 3 moves` | PASS |
| @ask off-topic (poem + weather) | decline, grounded=false | `grounded=false` (steered back to Rouven) | PASS |
| Auto-Read (fixed internal Q) | cites only room people, has moves | `grounded=true, cites=[john,alberto,rouven,chad], 3 moves` | PASS |

### Flagged misbehavior
None. The calibration produced 15 (not 0) for "very low", the single statement
produced exactly one edge, and the strategist grounded its cites to room people
and declined the off-topic request. No eval was loosened.

### Spend
`npm run trace:summary`: total local trace cost **$0.0519** across 15 traces
(0.1% of the $50 ceiling; remaining ~$49.95). Per-command averages: grid ~2.7k
tokens/call, network ~2.7k, strategist ~1.1k. Live raw traces are local only and
gitignored; production posture (metadata-only, raw off) is unchanged.

### Constraint check
Model used: `claude-haiku-4-5-20251001` (Haiku only). No raw production traces
written (this was the local bridge, traces gitignored). Encryption, rules
untouched. Spend logged and far under ceiling.

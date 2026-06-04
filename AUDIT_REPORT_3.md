# Audit Report 3

## Summary

Onboarding release complete. Implemented first-run guided onboarding, deployed
Firebase Hosting live, and prepared the repo push. Framework tooltip work and
live gated spend remain deliberately deferred.

Verified locally:
- `npm run verify:onboarding`: 19/19.
- `npm run verify:persistence`: 24/24.
- `npm run eval:offline`: 19/19.
- `npm run build`: clean, with the existing large bundle warning.

Blocked or deferred:
- Firestore emulator transport proof is still blocked by missing Java runtime.
- Automated browser screenshot is blocked because Playwright is not installed.
- Live gated eval was not run.

Deploy:
- `firebase deploy --only hosting --project the-situation-room-708c6` printed
  "Deploy complete!" and released Hosting, but exited 2 afterward because the
  Firebase CLI reported stale credentials/update-check trouble.
- Live verification: `https://the-situation-room-708c6.web.app` returns HTTP
  200 and serves `/assets/index-Chop_CnR.js` plus `/assets/index-CKcQhEni.css`.

Constraints:
- Haiku-only default remains `claude-haiku-4-5-20251001`.
- No raw production trace behavior changed.
- Encryption and owner-scoped Firestore rules were not changed.
- Onboarding reuses the existing `@create`, `@energy` (`grid` internally), and
  `@network` command pipeline. No fourth lens, quiz, diagnosis, or second
  interpreter was added.

## 2026-06-04 16:18:33 CEST - Hosting deploy

Findings:
- Firebase Hosting released the current `dist/` build to
  `https://the-situation-room-708c6.web.app`.
- Direct live checks return HTTP 200 and show the new built asset names.
- The Firebase CLI exits with code 2 after successful release because credentials
  need `firebase login --reauth` and the update-check config is not writable.

Actions:
- Deployed Hosting only. Functions and Firestore rules were unchanged.
- Confirmed the live URL after deploy.

## 2026-06-04 15:38:25 CEST - Onboarding implementation, local only

Findings:
- A pure "zero rooms on render" trigger can fire before a Firestore snapshot
  arrives. The safer trigger is a one-shot local marker set only after account
  creation or first Google sign-in.
- The onboarding write path must target the newly created decision explicitly,
  because React has not re-rendered with that selection before the LLM commands
  run.

Actions:
- Added `src/lib/onboarding.js` with three deterministic questions, no-model
  trigger helpers, decision seeding, and the command plan.
- Added `src/components/OnboardingChat.jsx`, a chat-like guided setup panel with
  assistant bubbles, user answer bubbles, skip, and final Open room action.
- Added a one-shot local onboarding marker in `src/lib/auth.js`. Existing
  sign-ins do not set it.
- Updated `src/views/Room.jsx` so empty states offer Start guided setup. The
  auto-start path only consumes the new-account marker and only when no usable
  room exists.
- The final onboarding step creates a room and decision, then calls
  `interpretRoomCommand` with `create`, `grid`, and `network`, applying results
  through the existing `applyRoomUpdate` path.
- Added `evals/fixtures/onboarding.json` and `scripts/verify-onboarding.mjs`.
- Updated architecture, design system, roadmap, and resolution log.

Assertions:
- Three fixed questions are used: pass.
- Skip path creates no onboarding writes before completion: pass by design and
  verifier.
- Existing usable rooms block auto-start: pass.
- Prompted users do not get repeated auto-start: pass.
- Mocked onboarding outputs create people, keep grid values banded, carry
  confidence, and map at most stated edges: pass.

## 2026-06-04 14:24:18 CEST - Phase A persistence/context verification

Findings:
- `npm run verify:persistence` passed 24/24. It verified encrypted free text
  round trips, Firestore message converters encrypt/decrypt persisted chat
  fields, message sort order survives pending timestamps, and `recentTurns`
  carries the prior "Maya reports to Sam" turn needed for anaphora.
- `java -version` failed because no Java runtime is installed on this machine.
- `npm run verify:emulator` could not start the Firestore emulator for the same
  reason. The transport-level reload proof remains blocked in this environment.

Actions:
- No code change was needed for Phase A.
- Treat persistence/context as logic-verified, with live emulator transport
  still flagged until Java is available.

Assertions:
- Sign in, create room + decision, send commands, reload, and rehydrate via
  Firebase emulator: blocked by missing Java runtime.
- Free text decrypts through the real converter path: pass.
- Anaphora context includes the prior turn needed to resolve "she" to Maya: pass.

# Audit Report: The Situation Room

Overnight full-project pass. One section per phase, appended with timestamps.
The executive summary at the top is written last. Each phase is committed
separately so it can be reviewed or reverted on its own.

> Status legend: FIXED (applied this pass), FLAGGED (left for your review with a
> reason), OK (audited, no change needed).

---

## EXECUTIVE SUMMARY

_Filled at the end of the run. See per-phase sections below until then._

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
</content>
</invoke>

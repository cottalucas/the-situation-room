# LLM pipeline and MLOps

How The Situation Room turns prose into validated room state and grounded
strategy, and how that pipeline is evaluated, traced, costed, and shipped. This is
the definitive reference for the AI layer. Build to it.

## Principles

- **Haiku only.** Every call uses `claude-haiku-4-5-20251001`. There is no
  Sonnet/Opus path. Cost is a feature, not an afterthought.
- **Grounded, never generic.** The model reads and writes one room and one
  decision. It does not invent people, edges, motives, or traits, and it declines
  off-topic requests. It is a stakeholder tool, not a chatbot.
- **Deterministic where possible.** Commands map prose to a strict JSON contract
  that the app validates and applies. The model proposes; the validator and the
  app dispose.
- **Offline-first evals.** Behavior is checked against mocked golden responses
  with no API calls. Live runs are deliberate and gated.

## The three model surfaces

1. **Commands (deterministic intake).** `@note`, `@energy` (alias `@grid`),
   `@network`, `@map`. Prose in, a validated `roomUpdate` out, applied to
   Firestore state. `@create` is retired as a user command (the panel and the
   user-facing router drop it); the internal `create` command path still backs
   onboarding's add-people step, so `ALLOWED_COMMANDS` and the apply capabilities
   keep it.
2. **Strategist (grounded reasoning).** `@ask`, "The Read", and the experimental
   open (non-command) chat. Prose question in, a grounded
   `{ answer, moves, cites, grounded }` out. Reasons over the room, cites the
   people/edges it used, declines off-topic and roleplay.
3. **Intent classifier (plain-text routing, gated).** `/api/classify-intent`
   maps a prefix-free message to one intent (`network`, `energy`, `note`, `ask`,
   `map`, `unclear`) with a confidence. It never writes anything. The flag
   `ENABLE_PLAIN_TEXT_ROUTING` (env `VITE_ENABLE_PLAIN_TEXT_ROUTING`) is **off in
   production**: a confident intent surfaces a tappable suggestion pill that runs
   the real command only on tap; low/unclear shows the command menu. Flipping the
   flag on lets a high-confidence intent route silently (with a `↳ treated as`
   label) and a medium one route with a confirmation. Analytics fire
   `plain_text_classified { intent, confidence, acted }` only; the raw text is
   never logged. Routing table evals: `npm run verify:classify`.

Open chat is gated behind two layers: `src/lib/chat-guard.js` (deterministic
input harness: empty / oversized / jailbreak / short pure-abuse blocked before any
call) and the strategist prompt itself (`strategist-v2`: grounding, off-topic and
roleplay refusal, profanity neutralized, injection ignored). It rides on
`VITE_ENABLE_LIVE_LLM` and is meant for deliberate testing.

The play generator (`/api/generate-play`) backs the `@play` command, called only
after the deterministic readiness gate (`src/lib/play-readiness.js`) passes.
First-person references resolve to the self record (`isSelf`), so the model never
duplicates the operator. `@network`, `@map`, and `@create` infer `influenceLevel`
(ring placement on the Network lens) per participant over this decision, excluding
the self user and never overwriting a user-set (`overridden`) level. `@network`
owns both jobs (edges plus influence) and gates influence on confidence: an
uncertain read asks a clarifying question rather than writing. It never touches
power/interest (`powerScore`); that is the Energy lens (`@energy`) only. The
contract validates levels in `normalizeRoomUpdate`, the boundary lives in
`commandCapabilities`/`influenceDecision`, and the apply path writes
`decision.influence`. The command prompt is bumped to
`room-command-v6-network-influence-2026-06-08` in both `src/` and `functions/`.
Offline evals: `npm run verify:influence` (inference) and `npm run verify:network`
(@network owns influence, never powerScore).

## Request path (end to end)

```
user prose
  -> Room.jsx parses the command and resolves the focus person to a stable id
     (src/lib/person-ref.js: ids, names, first names, role/title aliases, typos)
  -> src/lib/context.js builds the call: compactRoomCommandContext / strategist
     context = room snapshot (people w/ role, position, placement, recent notes),
     decision context, edges, and recentTurns (last 8 turns for anaphora)
  -> POST /api/<endpoint> with the Firebase Auth id token
     - local dev: vite.config.js middleware (reads key from .env.local)
     - production: functions/index.js (key from the ANTHROPIC_API_KEY secret)
  -> server verifies auth, checks per-user daily request + cost budget,
     calls Anthropic (Haiku), extracts JSON
  -> normalize/validate against the contract (src/lib/*-contract.js)
     - grid values: banded calibration, out-of-range rejected, confidence kept
     - edges: typed, deduped, self-edges dropped
     - strategist: cites grounded to room ids, banned-trait guard
  -> record usage + privacy-safe trace metadata, return a small public meta
  -> Room.jsx applies only in-scope fields, resolving every ref to a stable id;
     unknown refs are skipped, never duplicated
  -> store.js optimistic write -> firestore-repo.js (encrypt on write) -> Firestore
  -> onSnapshot confirms; the UI renders
```

## Prompts and the contract

- Prompts and versions live in `src/lib/llm-prompts.js`
  (`COMMAND_SYSTEM_PROMPT`, `STRATEGIST_SYSTEM_PROMPT`, `playPrompt`,
  `roomCommandPrompt`, `strategistPrompt`, and the `*_PROMPT_VERSION` constants).
- Validators live in `src/lib/room-command-contract.js`
  (`normalizeRoomUpdate`, `normalizeStrategistAnswer`) and
  `src/lib/play-contract.js`.
- **Grid calibration rubric** (in the command system prompt): very low 10-20,
  low 25-35, moderate 45-55, high 70-80, very high 85-95. Sub-10 / over-95 only on
  a stated absolute. Every value and edge carries a `confidence` of high/medium/low.
- **Edge discipline:** edges require explicit signal; one reporting line is one
  `defers` edge and nothing more.
- **Anaphora:** the system prompt resolves pronouns ("she", "he", "they", "this",
  "too") against `recentTurns` and the roster; it never invents a person.
- **Server-only framework grounding (cached prefix).** Structured commands run on
  top of a private `FRAMEWORK_GROUNDING` constant in `functions/index.js`
  (`GROUNDING_VERSION`): timeless theory only (power versus interest as
  independent axes, Mendelow quadrants, one signal line each for SCARF, Cialdini,
  Thomas-Kilmann, Fisher and Ury, the signal-reading lenses, the stance
  vocabulary, the suggestion-versus-note output contract). No named people, no
  worked cases, no colleague data: examples live in a separate example store. It
  is bundled with the Function only, never in Firestore and never in `src/lib`
  (which ships to the browser), so the client cannot read it. It is the cached
  system prefix on `@note`/`@grid`/`@network`/`@map` (and internal `create`/`net`):
  the system is two static blocks, grounding then `COMMAND_SYSTEM_PROMPT`, with
  `cache_control: { type: "ephemeral" }` on the last; per-call note text and room
  snapshot stay below it in the user turn. On Haiku 4.5 the cache needs a
  4096-token prefix to activate, and the static prefix is ~1.4k tokens, so
  `cache_read_input_tokens` is 0 today by design (density wins over padding); the
  wiring is correct, free, and auto-activates if the shared prefix later crosses
  4096. Traces log `groundingVersion` and an approximate `systemPrefixTokens`. The
  grounding is not mirrored in `src/`, so it has its own version and is excluded
  from the `COMMAND_PROMPT_VERSION` sync check (`COMMAND_SYSTEM_PROMPT` stays
  identical across both files); the Vite dev bridge does not carry it.

### Source of truth vs hand-synced copy (the one drift risk)

The Vite bridge imports the real modules from `src/lib/`. The Firebase Function is
a separate deployed package and cannot import across that boundary, so
`functions/index.js` keeps a hand-copied mirror of the prompts, rules, schemas,
and normalizers. They are kept in sync by the `*_PROMPT_VERSION` constants: any
prompt change must be applied to BOTH files and the version bumped in both. Verify
with:

```
diff <(grep -hoE '"(room-command|play|strategist)-[a-z0-9-]+"' src/lib/llm-prompts.js | sort) \
     <(grep -hoE '"(room-command|play|strategist)-[a-z0-9-]+"' functions/index.js | sort)
```

A shared module or a CI version-match assertion is the planned hardening.

## MLOps: evals, traces, cost, deploy

### Evals (the default no-credit check)

- `npm run eval` (alias `eval:offline`): runs `scripts/eval-v1.mjs` against
  `evals/fixtures/v1.json` golden responses through the real validators. No API
  calls, no spend. Covers every command, the strategist, the Auto-Read, banded
  calibration, single-statement edge discipline, validator rejection, strategist
  grounding, off-topic decline, and a banned trait/diagnosis vocabulary list.
- Targeted helper scripts: `verify:persistence` (crypto + converters + anaphora
  resolver), `verify:autoread` (threshold + cache-bust), `verify:confidence`
  (placement confidence shape), `verify:play` (the `@play` readiness gate, reason
  codes, coaching, coaching-reply stance parse, and play shape), `verify:self`
  (first-person resolves to the self record), `verify:emulator` (Firestore
  transport, needs Java).
- `npm run eval:live` (gated by `EVAL_ALLOW_LIVE=true` and `--live`): runs the
  fixtures against a live dev server. Bound spend with `EVAL_MAX_CASES` or
  `EVAL_CASE_IDS`. Record real output vs golden; never loosen an eval to make
  live pass.

Every behavioral change to LLM handling gets an offline fixture before it ships.

### Traces and privacy

- **Local:** live dev calls write full raw traces (prompt, raw text, parsed,
  normalized, usage, latency, cost) to the gitignored `llm-traces/`. For prompt
  debugging only.
- **Production:** the Function writes privacy-safe metadata + usage to
  `users/{uid}/llmTraces` and `users/{uid}/llmUsage/{YYYY-MM-DD}`. Raw prompts and
  model text are stored only when `LLM_STORE_RAW_TRACES=true`; the default is
  `false`. Clients can read their own usage/traces; only the Admin SDK writes them.

### Cost and the $50 ceiling

- The Function enforces per-user daily request and cost limits
  (`LLM_DAILY_REQUEST_LIMIT`, `LLM_DAILY_COST_LIMIT_USD`).
- `npm run trace:summary` reports total cost, per-command token and cost
  breakdown, and a budget block against `LLM_SPEND_CEILING_USD` (default 50).
- Token budgets per command are capped (`maxTokensForCommand`); context is
  compacted (8 recent turns, capped notes) to keep calls small.

### Deploy

```
firebase functions:secrets:set ANTHROPIC_API_KEY   # once; server-side only
npm run build
firebase deploy --only firestore:rules,hosting,functions
```

Hosting serves `dist/` and rewrites `/api/**` to the `api` Function. After a
prompt change, redeploy functions so production matches `src/`.

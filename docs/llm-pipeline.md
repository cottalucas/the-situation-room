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

## The three-role relay

Open English enters one chat; a controller understands intent and dispatches to
the mapper and/or the strategist; the controller is the single user-facing
voice. This replaces the earlier "three model surfaces" framing: the same three
Haiku calls exist, but they are now roles in one relay with a defined caller.

1. **Controller (evolved intent classifier).** `/api/classify-intent`. Expert in
   language and intent, not frameworks: it carries only enough framework
   vocabulary to recognize influence/power/conflict/stance language and route.
   It reads one prefix-free message and returns
   `{ intent: map|advise|both|unclear, command: note|energy|network|map|null,
   cleaned_intent, confidence: high|medium|low, clarifying_question }`
   (`controller-v2`, mirrored in `src/lib/llm-prompts.js` and
   `functions/index.js`; normalized by `normalizeClassification`). It never
   writes anything. `cleaned_intent` is the digest handed to the next expert: a
   pre-interpreted instruction, not raw English. On the `unclear` path it is
   explicitly `null` (never an improvised digest); the dispatch table reads
   `intent` first and returns a clarify action that never forwards
   `cleaned_intent`. The controller speaks the user-facing surface name `energy`;
   the dispatch layer translates that to the server command `grid` through one
   shared helper (`serverCommandForControllerCommand`), so `energy` never reaches
   `/interpret-room-command` (which is not in `ALLOWED_COMMANDS`). **The
   controller, and only the
   controller, carries the per-user idiolect layer**: in production the Function
   appends `buildUserPriorsBlock` (this user's name-redacted confirmed mappings,
   five-cap, skip negatives never surfaced, curated knowledge always outweighs)
   below its system prompt. The mapper no longer receives the priors.
2. **Mapper (deterministic intake).** `/interpret-room-command` behind `@note`,
   `@energy` (alias `@grid`), `@network`, `@map`. Prose in, a validated
   `roomUpdate` out, applied to Firestore state. When the call comes through the
   relay it also receives the controller's `cleaned_intent` as an `instruction`
   block; the verbatim user text still rides along and stays the source for any
   saved note, so the user's record is never paraphrased. Self-check, one pass,
   capped: when genuinely unsure WHICH mapping the text supports, the prompt
   resolves to the safe minimum (a note) or returns exactly one `openQuestion`
   up to the controller, which asks the user. No loop. The mapper never
   addresses the user directly. `@create` is retired as a user command; the
   internal `create` path still backs onboarding, so `ALLOWED_COMMANDS` and the
   apply capabilities keep it. As of `room-command-v9`, `@note` is no longer
   observations-only: it carries the full focus-person extraction (stance, grid,
   influence magnitude, and relationship edges) when the note text supports them,
   matching the `@map`/onboarding contract, while still always saving the verbatim
   note. `commandCapabilities("note")` opens grid/edges/influence to match, and the
   `note` `commandSchema` now shares the full intake schema. Onboarding's `create`
   step is broadened the same way and reads all three setup answers (not
   question-locked), and its `network` step always runs so influence and edges
   populate from relational signal in any answer. Never fabricated; unset where the
   text gives no signal.
3. **Strategist (grounded reasoning).** `/strategist` behind `@ask`, "The Read",
   and the relay's advise path. Prose question in, a grounded
   `{ answer, moves, cites, grounded }` out (`strategist-v5`). Each move is an
   object `{ move, framework? }`: a forcing function that asks the strategist to
   name the relevant framework lever (SCARF, Thomas-Kilmann, Cialdini, Fisher and
   Ury) WHEN the room data supports it. The `framework` field is
   optional-when-unsupported: the prompt omits it rather than inventing a lever,
   and `normalizeStrategistAnswer` keeps it only when present and non-empty, so an
   unsupported lever is omitted, not faked (same unknown-is-valid discipline used
   for the mapper). A sparse room is not a decline: it stays grounded with minimal
   moves (zero or one) that name what to map next. "When grounded is true, include
   at least one cite" is a prompt rule; `normalizeStrategistAnswer` keeps its
   id-filtering as the hard floor (an off-room id is dropped, never rejected).
   Answer length is two to four sentences in both the system prompt and the user
   schema. Reasons over the room, cites the people/edges it used, declines
   off-topic and roleplay. It shares the server-only knowledge base with the
   mapper (see grounding below) but never the extraction contract. Budget is 1200
   max tokens (raised from 900, which truncated a full answer plus three moves).

**Sequenced dispatch (a state machine, never an LLM-to-LLM loop).** The pure
table is `planClassificationAction` in `src/lib/room-command-contract.js`;
`Room.jsx#dispatchControllerPlan` executes it. Explicit `@commands` bypass the
controller entirely (the unchanged fast path). For plain text:

- `unclear` or low confidence -> the controller asks its ONE clarifying
  question and never guesses. The reply re-enters as fresh plain text.
- Flag `ENABLE_PLAIN_TEXT_ROUTING` (env `VITE_ENABLE_PLAIN_TEXT_ROUTING`) **on by
  default** (`room-command-v9`): bare text routes straight through the mapper as
  one comprehensive `@map` pass (people, notes, stance, grid, edges, influence)
  and the reply names the specific changes across lenses, built deterministically
  from the applied update, no second model call. When nothing actionable extracts
  the reply is a brief ack and one nudge toward `@grid`/`@network`/`@play`. The
  Strategist is never invoked by bare text.
- Flag off (`VITE_ENABLE_PLAIN_TEXT_ROUTING=false`, rollback): the older controller
  path returns. A confident read surfaces one tappable suggestion pill that mutates
  nothing until the tap; on tap the sequence is mapper first, then for `both` the
  strategist on the UPDATED room (fresh decision, participants, and edges).
- One user-facing voice: every question and result reaches the user through the
  controller's dispatch. Mapper and strategist return results or one
  clarification to it; the relay caps relayed mapper questions at one. The
  existing chat UX is preserved (user bubbles, raised result cards, play card).

Analytics fire `plain_text_classified { intent, command, confidence, routed_to,
resolution, acted }` only, enums and never text. Dispatch-table evals:
`npm run verify:classify`.

Open chat is gated behind two layers: `src/lib/chat-guard.js` (deterministic
input harness: empty / oversized / jailbreak / short pure-abuse blocked before any
call) and the strategist prompt itself (`strategist-v5`: grounding, off-topic and
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
`decision.influence`. The command prompt is
`room-command-v9-relay-2026-06-15` in both `src/` and `functions/` (v7 added the
controller-instruction block and the one-pass self-check rule; v8 sharpens that
block to say "trust it for ROUTING; the verbatim user text governs all saved
notes and all inferred values", and softens saved-note wording to "one note in
the user's words, cleaned of profanity only" to stop over-paraphrasing; v9
broadens `@note` to the full focus-person extraction and folds the `note`
`commandSchema` into the shared intake schema). The full
`profilePatch` shape (goal, context, baseRead, visualTags) is identical in both
files' `commandSchema`; a sync assertion in `npm run eval` compares the rendered
JSON for every command and fails on any drift, so production can never show Haiku
an emptier framework-read target than dev again.
Offline evals: `npm run verify:influence` (inference) and `npm run verify:network`
(@network owns influence, never powerScore).

## Request path (end to end)

```
user prose
  -> explicit @command: Room.jsx parses it directly (fast path, no controller)
  -> plain text (open chat on): chat-guard screen
     -> POST /api/classify-intent (controller + per-user idiolect priors)
     -> planClassificationAction: clarify (one question) | pill (flag off)
        | route/confirm (flag on)
     -> dispatchControllerPlan: mapper first (with cleaned_intent), then for
        "both" the strategist on the updated room
  -> Room.jsx resolves the focus person to a stable id
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
- **Grid-reading rubric** (mapper-only, in `COMMAND_SYSTEM_PROMPT`, ~345 tokens,
  `room-command-v10-gridrubric-2026-06-16`): read the DIRECTION a signal moves a
  value before banding it. Interest UP on engagement/escalation/blocking, DOWN on
  disengagement (skips own meeting, goes quiet, delegates away). Power UP on
  promotion/sign-off/sponsor, DOWN on removal/sidelining. **Opposition discipline:
  opposition is an interest and stance signal, never power. "key blocker",
  "against", "pushing back" raise interest or set position against and NEVER lower
  power** (the QA-flagged power-under-read). Stance stays for/against/neutral/unknown;
  unknown is terminal, never fabricated. **Act vs ask:** a resolvable referent whose
  signal maps through the rubric is applied and named (no question); an unresolvable
  referent gets exactly one `openQuestion` and no mutation, never a guess. This is a
  mapper-prompt change only: `FRAMEWORK_GROUNDING` and the strategist's
  `STRATEGIST_LEVERS` are untouched, so the strategist prefix stays byte-identical.
- **Edge discipline:** edges require explicit signal; one reporting line is one
  `defers` edge and nothing more.
- **Anaphora:** the system prompt resolves pronouns ("she", "he", "they", "this",
  "too") against `recentTurns` and the roster; it never invents a person.
- **Server-only shared knowledge base (cached prefix).** The mapper and the
  strategist share one server-only module, `functions/knowledge.js`:
  `FRAMEWORK_GROUNDING` (`GROUNDING_VERSION`), timeless theory only (power versus
  interest as independent axes, Mendelow quadrants, one signal line each for
  SCARF, Cialdini, Thomas-Kilmann, Fisher and Ury, the signal-reading lenses, the
  stance vocabulary, the suggestion-versus-note output contract), and
  `GLOBAL_LEARNINGS` (`GLOBAL_LEARNINGS_VERSION`), curated, name-agnostic
  phrasing-to-mapping heuristics that hold across users (for example,
  "rubber-stamped it" maps to interest low, not stance supportive), each a
  concrete `[person]` phrasing mapped to an axis or stance with a short reason,
  shaped so it could become an eval case. No named people, no worked cases, no
  colleague data: examples live in a separate example store. The module is
  bundled with the Function only, never in Firestore and never in `src/lib`
  (which ships to the browser), so the client cannot read it. It is curated by
  hand, never auto-grown from user data; grounding plus learnings stays under
  ~900 words by tightening, not adding. Two cached prefixes are built from it:
  the mapper runs grounding then `GLOBAL_LEARNINGS` then `COMMAND_SYSTEM_PROMPT`
  (the extraction contract) on `@note`/`@grid`/`@network`/`@map` and internal
  `create`/`net`; the strategist runs grounding then `GLOBAL_LEARNINGS` then
  `STRATEGIST_LEVERS` then `STRATEGIST_SYSTEM_PROMPT`, never the extraction
  contract. `STRATEGIST_LEVERS` (`STRATEGIST_LEVERS_VERSION`, ~850 tokens) is a
  strategist-only third block of trigger -> lever move-selection depth (grid
  position + stance + edges -> which framework lever applies and why, e.g.
  high-power/low-interest/against -> Mendelow keep satisfied + SCARF autonomy,
  raise interest not fight power; a defers edge A -> B -> route influence through
  B via Cialdini authority). It carries advice verbs the mapper must never act on,
  so it is wired into the strategist prefix ONLY and the mapper's
  `COMMAND_SYSTEM_BLOCKS` stays byte-identical. Each carries
  `cache_control: { type: "ephemeral" }` on its last static block; per-call text
  and room snapshot stay below in the user turn. On Haiku 4.5 the cache needs a
  4096-token prefix to activate, and each static prefix is ~2k tokens, so
  `cache_read_input_tokens` is 0 today by design (density wins over padding); the
  wiring is correct, free, and auto-activates if a prefix later crosses 4096 as
  the curated learnings grow. Command and strategist traces log
  `groundingVersion` and `learningsVersion` (commands also an approximate
  `systemPrefixTokens`; the strategist also logs `leversVersion`). The knowledge
  module is not mirrored in `src/`, so it
  has its own versions and is excluded from the `COMMAND_PROMPT_VERSION` sync
  check (`COMMAND_SYSTEM_PROMPT` stays identical across both files); the Vite dev
  bridge does not carry it. The controller gets none of it: language and routing
  only.
- **Per-user soft priors (dynamic, controller-only).** A third layer personalizes
  the relay. When a user confirms or corrects a suggested mapping, the Function
  captures one name-redacted example
  (`/api/capture-example` -> `functions/learning-store.js#buildExample`, which
  redacts every participant name, email, and handle to `[person]` BEFORE storage)
  under `users/{uid}/learningExamples`. Client read and write are denied in
  `firestore.rules`; only the Function touches it. At controller time
  (`/classify-intent`) the Function reads this user's recent confirmed examples,
  builds a soft-prior block (`buildUserPriorsBlock`), and appends it as one
  system block below the controller prompt, where it serves as the idiolect
  layer: how this user phrases things, used to digest `cleaned_intent` and route.
  The mapper and strategist never receive it, so the cached knowledge prefixes
  stay byte-identical. Hard rules baked into the block and the selection: the
  curated grounding and global learnings ALWAYS outweigh the priors, skip
  negatives never surface, and the slice is capped at five (`MAX_USER_PRIORS`) so
  a user's repeated mistakes cannot dominate, the loop must not learn errors as
  truth. Controller traces record `userPriorsCount`. Analytics are content-free:
  one fire-and-forget `example_captured { action_type, was_adjusted }`, never
  phrasing or names. `functions/learning-store.js` is server-only; the dev bridge
  redacts through it for parity but does not persist or inject. Offline eval:
  `npm run verify:learning`.

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

A shared module or a CI version-match assertion is the planned hardening. The
`commandSchema()` structure is now guarded directly: `npm run eval` extracts both
files' `commandSchema` as text and asserts their rendered JSON is identical for
every command, so schema drift fails the suite even when the version strings
happen to match.

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
  (first-person resolves to the self record), `verify:learning` (the per-user
  example store: name redaction before storage, soft-prior precedence over a clear
  grounding rule, and the five-example cap), `verify:emulator` (Firestore
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

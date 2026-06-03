# The Situation Room

A tool for reading the people behind a decision and planning how to move them.
Rooms hold decisions; each decision has three lenses: **People**, **Energy** (the
Mendelow power/interest map), and **Network** (who moves whom). A command-first
chat maps prose into notes, energy placements, and network edges, and a grounded
strategist (`@ask`) reasons over the room.

The source of truth for design and behavior is the `docs/` set. Start there:
`docs/brief.md`, `docs/architecture.md`, `docs/design-system.md`,
`docs/roadmap.md`, `docs/resolution-log.md`, and the working loop in
`docs/orchestration.md`.

## Run the app locally

```bash
npm install
cp .env.example .env.local   # fill Firebase web config; never commit it
npm run dev
```

Use `localhost`, not `127.0.0.1` (Firebase auth domains and storage are
origin-specific; `main.jsx` redirects loopback to `localhost` anyway).

Local-only flags in `.env.local`:
- `VITE_ENABLE_LOCAL_PREVIEW=true` shows one seeded preview room without auth.
- `VITE_ENABLE_LIVE_LLM=true` plus `ANTHROPIC_API_KEY` enables the local Claude
  bridge for `@`-command and `@ask` testing through the Vite dev endpoints. The
  key stays server-side and never reaches the browser.

## Run the evals (the default no-credit check)

Offline evals validate every command and the strategist against the real
contracts using mocked model responses. They never call Claude and spend no
credits. This is the one-line check:

```bash
npm run eval        # alias of eval:offline
```

Coverage: `@note`, `@energy`/`@grid`, `@network`, `@map`, `@create`, the `@ask`
strategist, and the parked play generator. Assertions include banded grid
calibration, no-extreme-without-an-absolute, single-statement single-edge
discipline, validator rejection of out-of-range writes, strategist grounding
(cites only people in the room), off-topic decline, and a banned trait/diagnosis
vocabulary list. Results write to the gitignored `evals/runs/latest.json`.

Live evals spend credits and are deliberately gated:

```bash
EVAL_ALLOW_LIVE=true npm run eval:live   # requires the dev server running
```

Bound a live run with `EVAL_MAX_CASES` or target ids with `EVAL_CASE_IDS`.

## Watch spend (cost / usage)

Every local live call writes a raw trace under `llm-traces/` (gitignored).
Summarize spend, tokens per command, and failures:

```bash
npm run trace:summary
```

It reports total cost, per-command token and cost breakdown, and a budget block
against a configurable ceiling (`LLM_SPEND_CEILING_USD`, default 50) so you can
watch local spend against the project's ~$50 Anthropic budget. Production usage
is recorded per user per day in Firestore at `users/{uid}/llmUsage/{YYYY-MM-DD}`
(requests, cost, tokens); the Function also enforces per-user daily request and
cost limits.

All model calls run on **Claude Haiku** by default. There is no Sonnet/Opus call
path.

## Privacy posture

- Personal free text (notes, goals, framework reads, decision context, chat
  message bodies) is encrypted client-side (AES-GCM) before Firestore writes.
- Production stores only privacy-safe LLM trace metadata and usage under the
  signed-in user. Raw prompts and responses are off by default
  (`LLM_STORE_RAW_TRACES=false`); raw traces are a local debugging tool only.
- Firestore rules scope every document to its owner. Notes are readable only by
  their owner.

## Deploy

The Anthropic key is a Firebase Functions secret, never in source control:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY

npm run build                              # builds dist/
firebase deploy --only hosting,functions,firestore:rules
```

`firebase.json` serves `dist/`, rewrites `/api/**` to the `api` Function, and
SPA-rewrites the rest. Function runtime knobs live in `functions/.env.example`
(`ANTHROPIC_MODEL` pinned to Haiku, daily request and cost limits,
`LLM_STORE_RAW_TRACES`).

## CI

`.github/workflows/ci.yml` runs the app build, the offline eval harness, and a
Firebase Function syntax check on every push.

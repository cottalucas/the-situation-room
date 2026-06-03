# Eval Harness V1

This harness keeps the LLM from becoming a generic chatbot. It checks the two
contracts that matter now:

- play generation: a grounded, sequenced play with risk and reasoning. This
  contract is retained for future play evals, but open chat is parked in the UI.
- room mapping: concise notes, optional framework reads, grid placement,
  stance, network edges, and open questions.

## No-credit run

```
npm run eval:offline
```

This validates the fixture outputs and contract rules. It does not call Claude.
It writes the latest trace to `evals/runs/latest.json`, which is ignored by git.

## Live run

Live evals spend Anthropic credits. Run them only when you intend to spend.

```
npm run dev
EVAL_ALLOW_LIVE=true EVAL_BASE_URL=http://127.0.0.1:5173 node scripts/eval-v1.mjs --live
```

Use live runs after prompt changes, model changes, or command contract changes.
Limit spend with `EVAL_MAX_CASES=1` or select exact cases with
`EVAL_CASE_IDS=command-network-implicit-reporting`.

## Traces

Live Claude calls write local traces to `llm-traces/`. The folder is ignored by
git because it contains private prompts and raw model responses.

```
npm run trace:summary
```

The summary shows latency, usage, estimated cost, failures, and the latest trace
file. Use the raw trace files for trace analysis and to turn real failures into
new reference fixtures.

## What V1 Scores

- valid JSON shape.
- grounded person references.
- play focus with concrete steps.
- risk and signal present.
- no repeated profanity, insults, or manipulation language.
- notes stay concise.
- map commands update the expected lens.
- open questions stay bounded at two.
- network commands extract implicit reporting, control, alliance, and conflict.

## What Comes Next

- Add consented or synthetic cases from real usage.
- Add human review labels for whether the play is worth acting on.
- Add provider/model comparisons.
- Add cost, latency, and token usage summaries from live traces.
- Export runs to Braintrust or another eval tool once the fixture set has
  enough signal to justify dashboarding.

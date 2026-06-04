# Audit Report (consolidated)

One-time consolidation of the two overnight due-diligence passes. Going forward we
do not maintain audit reports: the running record lives in
`docs/resolution-log.md`, and the definitive design lives in
`docs/architecture.md`, `docs/roadmap.md`, `docs/design-system.md`, and
`docs/llm-pipeline.md`. This file is the snapshot of what happened, what changed,
and where things stand.

## What happened

Two autonomous passes over the codebase.

**Pass 1 (full-project audit + remediation).** Audited architecture, data model,
the LLM interpretation layer, rendering, and observability, and fixed the core
pain plus several smaller items. Headline change: the LLM over-committed to extreme
grid values and over-inferred network edges. Result: clean build, scoped rules,
Haiku-only, offline evals 7 -> 15.

**Pass 2 (verify + make the strategist the spine).** Verified pass 1's persistence
and anaphora, then made the grounded strategist first-class and deployed live.

## What changed (by theme)

- **Calibrated interpretation.** `@energy`/`@grid` maps qualitative language to
  bands (very low 10-20 ... very high 85-95), reserves sub-10/over-95 for stated
  absolutes, carries a `confidence` per value/edge, rejects out-of-range writes,
  and holds extremes / soft-confirms low-confidence reads. `@network` only creates
  edges from explicit signal (one reporting line = one `defers` edge).
- **Grounded strategist.** `@ask` and "The Read" reason over the room, cite the
  people they use, decline off-topic, and never diagnose or assign traits. Haiku,
  budget-guarded, additive to the commands.
- **Persistent, context-aware chat.** Messages persist per decision in Firestore
  (encrypted free text), rehydrate on load, and carry a last-8-turn context window
  for anaphora.
- **Energy rename + low-confidence honesty.** The "Grid" lens is now "Energy"
  (`@energy`, with `@grid` as a hidden alias, no data migration). Low-confidence
  placements render a dashed needs-confirm dot.
- **Docs + observability.** Folder map and LLM docs corrected; per-command token
  and $50-ceiling cost readout in `trace:summary`; README with the one-line eval
  runner and deploy steps; this pass adds `docs/llm-pipeline.md`.

## What was verified

- Offline eval suite: 16/16, no API calls.
- `verify:persistence` 24/24 (real crypto + Firestore message converters + sort +
  anaphora resolver + context assembly), `verify:autoread` 10/10,
  `verify:confidence` 9/9.
- Gated live run on real Haiku, 5/5: "very low interest" -> 15 (banded, not 0),
  "Maya reports to Sam" -> one defers edge, `@ask` grounded, off-topic declined,
  Auto-Read grounded. Spend ~$0.05 of the $50 ceiling.
- Deployed live to `the-situation-room-708c6`; `POST /api/strategist` returns 401
  unauthenticated (endpoint live, routed, secured).

## Current situation

The deterministic commands and the grounded strategist are live and tested. The
encryption, owner-scoped rules, and Haiku-only cost posture hold. The chat is
persistent and context-aware. The open (non-deterministic) chat is intentionally
still gated behind commands and the grounded strategist.

## Known limitations / flagged

- LLM contract is hand-copied into `functions/index.js` (separate package), kept
  in sync by the prompt-version string. Shared module / CI check is the planned fix.
- Firestore emulator transport test is written but needs Java to run.
- Encryption derives the key from the Firebase uid (encrypted at rest, not
  zero-knowledge); a user passphrase is the next privacy step.
- Functions runtime Node 20 is deprecated (decommission 2026-10-31); bump engines
  before then.

For anything more granular, read `docs/resolution-log.md` (dated, newest first).

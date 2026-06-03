# Orchestration

The loop every agent runs on every task, whatever the tool (Claude Code, Codex,
Cursor, or a human). Follow it in order. It exists to keep context high, errors
low, and token use down by writing decisions down once instead of rediscovering
them every session.

## The loop

1. Read first. Before touching code, read in this order:
   - `docs/brief.md` for what and why.
   - `docs/architecture.md` for the data model, the store interface, the folder map.
   - `docs/design-system.md` for the visual language and the copy rules.
   - `docs/roadmap.md` for what is built, next, and out of scope.
   - `docs/resolution-log.md` for decisions already made. Do not relitigate them.

2. Challenge conflicts. If the task conflicts with the docs, stop and flag it
   before building. Name the conflict, propose the resolution, wait if it is
   material. Silent divergence is the expensive failure.

3. Build to the docs. Match the data model, the store interface, the design
   tokens, and the copy rules. Reuse existing components. One primary action per
   view. Do not introduce a new pattern when one exists.

4. Verify before done. Run the build. Check the UI against the anti pattern list
   in `design-system.md`: tiny fonts, cramped spacing, low contrast, washed out
   color, inconsistent rhythm, more than one primary action. If a preview is
   available, look at the actual screen, not just the diff.

5. Update the docs. If the data shape, store interface, folder structure, or
   visual system changed, update `architecture.md` and `design-system.md` in the
   same pass. Stale docs are worse than no docs.

6. Log the resolution. Append a dated entry to `docs/resolution-log.md`: what
   changed, why, and any decision a future agent should not have to make again.

## Definition of done

- Builds clean.
- Matches `design-system.md`.
- The store interface in `architecture.md` did not change shape unless the doc
  was updated to match.
- Docs and resolution log updated.
- Copy follows the anti slop rules: active voice, no filler, no em dashes, no
  hyphen as a connector. Compound words keep their hyphen.
- No secrets committed.

## Why this is tool agnostic

`CLAUDE.md`, `.cursorrules`, and `AGENTS.md` at the repo root all point here, so
Claude Code, Cursor, and Codex each land on the same loop and the same docs. The
source of truth is the `docs/` set, never a tool specific file.

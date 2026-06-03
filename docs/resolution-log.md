# Resolution log

Project memory. Append a dated entry per task. Newest at the top. Do not delete
entries; correct them with a follow up that references the original.

---

## 2026-06-03 — Persistence shape (correction)

Persistence is Firebase as the store of record, arriving later, with an
encrypted local cache (IndexedDB, AES-GCM) in front for fast load and session
consistency. This corrects an earlier framing of local-first-only. The cache is
not the source of record. On conflict, Firebase wins once it lands.

The store interface in `architecture.md` does not change. The cache sits behind
the same functions. Encryption key is held locally for now; a per-user key from
auth slots in at the auth pass.

## 2026-06-03 — Orchestration layer added

Added `docs/orchestration.md` (the loop), this log, and root pointers
`CLAUDE.md`, `.cursorrules`, `AGENTS.md` so every tool reads the same docs.

## 2026-06-03 — Encrypted local cache landed

Added `lib/crypto.js` (AES-GCM via Web Crypto) and `lib/cache.js` (IndexedDB).
The store hydrates from the cache on init and persists an encrypted snapshot on
every commit, debounced. The whole state blob is encrypted at rest, which covers
every personal field (notes, person context, history). Key lives in localStorage
for now with a TODO to derive it from the authed user.

## 2026-06-03 — UX structure pass

- Sidebar now nests decisions under the active room, archived collapsed within
  decisions. Edit and delete moved to a hover overflow menu. Room delete needs a
  typed confirmation.
- Left rail collapses and the state persists in the cache.
- Decisions include the whole roster by default. People tab removes a
  participant or adds an external. The add from roster action is gone.
- Grid no longer scrolls horizontally. Quadrant tints restored to the tokens.
- Chat resting state is the framed "read the room" card. A commands modal lists
  the chat commands.
- Landing gained a register modal and the app gained a sign out control, both UI
  only with auth wired in the next pass.

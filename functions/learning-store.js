// Per-user self-learning example store: pure helpers.
//
// This module is bundled with the Firebase Function only. It is never imported by
// src/ and so never reaches the browser, the same privacy boundary as the
// framework grounding and global learnings. It holds no Firestore or Firebase
// imports so it can be unit-tested in isolation (scripts/verify-learning.mjs).
//
// The store captures, per user, how they confirm or correct suggested mappings,
// name-redacted at write time. At call time the Function injects a small slice of
// the user's most recent confirmed examples as SOFT priors below the cached
// prefix. Hard rule: the curated grounding and global learnings always outweigh
// these priors, and the slice is capped so a user's repeated mistakes can never
// dominate the read.

export const LEARNING_AXES = new Set(["power", "interest", "stance", "influence"]);
export const LEARNING_ACTIONS = new Set(["accept", "adjust", "skip"]);
export const MAX_USER_PRIORS = 5;

// Confirmed actions carry positive weight; a skip is a weak negative. Adjust is
// the strongest signal (the user corrected the model), so it outweighs a plain
// accept when present.
export const ACTION_WEIGHT = { adjust: 2, accept: 1, skip: 0.25 };

function clampText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Redact a colleague's name and identifiers from a phrasing BEFORE it is stored.
 * Every supplied name (and each whitespace token of it, so first names are caught
 * too) becomes the [person] placeholder. Emails and @handles are redacted as a
 * safety net. The raw phrasing and the names themselves are never stored: only the
 * redacted pattern this returns. Longer names are redacted first so a full name is
 * replaced before its first-name token.
 *
 * @param {string} phrasing   the raw note text (never stored)
 * @param {string[]} names    names/identifiers to redact (room participants)
 * @returns {string} the name-agnostic phrasing pattern, safe to store
 */
export function redactPattern(phrasing, names = []) {
  let text = String(phrasing == null ? "" : phrasing);
  // Safety net first, while emails/handles are still intact: name redaction can
  // otherwise rewrite the local part of an address into a form these miss.
  text = text.replace(/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g, "[person]");
  text = text.replace(/(^|\s)@\w+/g, "$1[person]");
  const tokens = new Set();
  for (const raw of Array.isArray(names) ? names : []) {
    const name = String(raw == null ? "" : raw).trim();
    if (name.length >= 2) tokens.add(name);
    for (const part of name.split(/\s+/)) {
      if (part.length >= 2) tokens.add(part);
    }
  }
  const ordered = [...tokens].sort((a, b) => b.length - a.length);
  for (const tok of ordered) {
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${esc}\\b`, "gi"), "[person]");
  }
  // Collapse adjacent placeholders ("[person] [person]" -> "[person]").
  text = text.replace(/\[person\](\s+\[person\])+/g, "[person]");
  return clampText(text, 240);
}

/**
 * Build the stored example from a capture request. Returns null if the inputs do
 * not describe a usable mapping. The phrasing is redacted here; raw text and names
 * never enter the returned object.
 */
export function buildExample({ phrasing, names, mappingOutcome, axis, action, confidence }) {
  const cleanAxis = LEARNING_AXES.has(axis) ? axis : null;
  const cleanAction = LEARNING_ACTIONS.has(action) ? action : null;
  const outcome = clampText(mappingOutcome, 60);
  const pattern = redactPattern(phrasing, names);
  if (!cleanAxis || !cleanAction || !outcome || !pattern) return null;
  const conf = ["high", "medium", "low"].includes(confidence) ? confidence : "low";
  return {
    phrasingPattern: pattern,
    mappingOutcome: outcome,
    axis: cleanAxis,
    action: cleanAction,
    confidence: conf,
    weight: ACTION_WEIGHT[cleanAction],
  };
}

/**
 * Select the soft-prior slice for a user: confirmed examples only (skip negatives
 * are stored but never surfaced as priors), most recent first, capped at
 * MAX_USER_PRIORS. The cap is the guard that stops a user's repeated mistakes from
 * dominating the read.
 *
 * @param {Array} examples  raw examples, each with a numeric createdAt (millis)
 * @param {number} cap
 */
export function selectUserPriors(examples, cap = MAX_USER_PRIORS) {
  return (Array.isArray(examples) ? examples : [])
    .filter((e) => e && e.action !== "skip" && e.phrasingPattern && e.axis && e.mappingOutcome)
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
    .slice(0, Math.max(0, cap));
}

/**
 * Render the soft-prior system block appended below the static system prompt.
 * Returns null when there is nothing to add. The controller is the only role
 * that carries this idiolect layer: it reads these as hints for this user's
 * phrasing and shorthand. The block states the hard rule explicitly: the
 * curated grounding and global learnings always outweigh these priors.
 */
export function buildUserPriorsBlock(examples) {
  const priors = selectUserPriors(examples);
  if (!priors.length) return null;
  const lines = priors.map(
    (e) => `- This user tends to map: "${e.phrasingPattern}" -> ${e.axis}: ${e.mappingOutcome} (${e.confidence} confidence)`
  );
  return [
    "User priors. Soft, lowest priority, for this one user.",
    `These are weak personalization hints from what this user confirmed or corrected before, capped at ${MAX_USER_PRIORS}. The curated framework grounding and the global learnings ALWAYS outweigh them. Never follow a prior that conflicts with a grounding rule or a global learning, and never let a repeated user phrasing override a clear signal in the input. When a prior and the grounding disagree, follow the grounding.`,
    ...lines,
  ].join("\n");
}

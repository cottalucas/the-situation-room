// Offline verifier for the per-user self-learning example store.
// Proves the three guarantees that matter for privacy and for not learning
// errors as truth:
//   (a) name redaction happens BEFORE storage,
//   (b) user examples are soft priors that never override a clear grounding rule,
//   (c) the 5-example cap holds.
// No credits, no Firebase: it imports the pure helpers the Function uses.

import {
  redactPattern,
  buildExample,
  selectUserPriors,
  buildUserPriorsBlock,
  MAX_USER_PRIORS,
} from "../functions/learning-store.js";

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  FAIL: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// (a) Name redaction happens before storage.
// ---------------------------------------------------------------------------
const names = ["Chad Morrison", "Priya", "Bob Lee"];

const r1 = redactPattern("Chad signed off on the budget", names);
check("(a) first name redacted", r1 === "[person] signed off on the budget");
check("(a) raw name never survives redaction", !/chad/i.test(r1));

const r2 = redactPattern("Chad Morrison rubber-stamped Priya's proposal", names);
check("(a) full name redacted", !/morrison/i.test(r2) && !/chad/i.test(r2));
check("(a) possessive first name redacted", !/priya/i.test(r2) && /\[person\]'s/.test(r2));

const r3 = redactPattern("email chad.morrison@corp.com or ping @chadm about it", names);
check("(a) email redacted", !/morrison/i.test(r3) && !/@corp\.com/.test(r3));
check("(a) handle redacted", !/@chadm/i.test(r3));

// Substring safety: a name token must not over-redact an unrelated word.
const r4 = redactPattern("Bob led the robust review", names);
check("(a) substring not over-redacted", /robust/.test(r4) && !/\bBob\b/.test(r4));

// buildExample must redact at build time and never expose the raw phrasing/names.
const ex = buildExample({
  phrasing: "Chad signed off on the budget",
  names,
  mappingOutcome: "high",
  axis: "power",
  action: "accept",
  confidence: "high",
});
check("(a) buildExample stores a redacted pattern", ex && ex.phrasingPattern === "[person] signed off on the budget");
check("(a) buildExample never carries raw phrasing field", ex && !("phrasing" in ex) && !("names" in ex));
check("(a) buildExample drops unusable axis", buildExample({ phrasing: "x", names, mappingOutcome: "high", axis: "vibes", action: "accept" }) === null);

// ---------------------------------------------------------------------------
// (b) User examples are soft priors; grounding always wins.
// ---------------------------------------------------------------------------
const block = buildUserPriorsBlock([
  { phrasingPattern: "[person] went quiet", mappingOutcome: "supportive", axis: "stance", action: "accept", confidence: "low", createdAt: 5 },
]);
check("(b) block marks priors as soft / lowest priority", /soft/i.test(block) && /lowest priority/i.test(block));
check("(b) block states grounding ALWAYS outweighs", /ALWAYS outweigh/.test(block));
check("(b) block tells model to follow grounding on conflict", /follow the grounding/i.test(block));
check("(b) skip negatives never surface as priors", buildUserPriorsBlock([
  { phrasingPattern: "[person] stalled", mappingOutcome: "low", axis: "interest", action: "skip", confidence: "low", createdAt: 9 },
]) === null);
check("(b) no examples means no block (cached prefix only)", buildUserPriorsBlock([]) === null);

// ---------------------------------------------------------------------------
// (c) The 5-example cap holds.
// ---------------------------------------------------------------------------
const many = Array.from({ length: 12 }, (_, i) => ({
  phrasingPattern: `[person] phrasing ${i}`,
  mappingOutcome: "high",
  axis: "power",
  action: "accept",
  confidence: "high",
  createdAt: i, // ascending; newest = 11
}));
const selected = selectUserPriors(many);
check("(c) cap is 5", MAX_USER_PRIORS === 5 && selected.length === 5);
check("(c) most recent kept (newest createdAt first)", selected[0].createdAt === 11 && selected[4].createdAt === 7);
const cappedBlock = buildUserPriorsBlock(many);
check("(c) rendered block lists exactly 5 priors", (cappedBlock.match(/^- This user tends to map:/gm) || []).length === 5);

// ---------------------------------------------------------------------------
console.log(`\nverify:learning ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

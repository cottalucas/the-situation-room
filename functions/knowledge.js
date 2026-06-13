// Shared server-only knowledge base for the mapper and the strategist.
//
// FRAMEWORK_GROUNDING is timeless stakeholder theory; GLOBAL_LEARNINGS is the
// curated, name-agnostic phrasing-to-mapping heuristics that hold across users.
// Both are bundled with the Function only: never written to Firestore, never
// placed in src/lib (which ships to the browser), so the client cannot read
// them. They carry their own versions because they are NOT mirrored in src/, so
// they must not ride on COMMAND_PROMPT_VERSION (which stays byte-identical
// across src/ and functions/ for the sync check). Extend by tightening, not
// bloating: keep grounding + learnings under ~900 words.
//
// The mapper (/interpret-room-command) gets both plus the extraction contract
// (COMMAND_SYSTEM_PROMPT). The strategist (/strategist) gets both and never the
// extraction contract. The controller (/classify-intent) gets neither: it is a
// language and intent expert, not a framework expert.

export const GROUNDING_VERSION = "framework-grounding-v1-2026-06-09";
export const FRAMEWORK_GROUNDING = `
Framework grounding. Reference for every read you propose.

CENTRAL RULE. Power and interest are independent axes, never one scale.
- Power is formal authority, deference from others, and control over budget, headcount, scope, or a required dependency. Who must say yes.
- Interest is engagement, stake, energy, and attention spent on this decision. How much they care.
- The axes do not move together. High power with low interest is common and valid, such as a senior sponsor who delegates. Read them separately every time.
- Disengagement, lateness, distraction, and "does not seem to care" are interest signals. They lower an interest read only. They never lower a power read. A disengaged person can still hold a veto.

MENDELOW QUADRANTS from the two axes.
- High power, high interest: manage closely.
- High power, low interest: keep satisfied.
- Low power, high interest: keep informed.
- Low power, low interest: monitor.

FRAMEWORK SIGNALS. Detect the signal, map it to the handle.
- SCARF: a threat to status, certainty, autonomy, relatedness, or fairness signals resistance and raised interest. Map to the threatened dimension and a guarded or against stance.
- Cialdini: reciprocity, commitment, social proof, authority, liking, or scarcity in play is an influence lever. Map to the lever as a move handle, not a trait.
- Thomas-Kilmann: observed conflict behavior, competing, collaborating, compromising, avoiding, or accommodating, maps to a conflict style handle for sequencing the approach.
- Fisher and Ury: a stated position that differs from an underlying interest signals room to trade. Map to interests and BATNA, not the surface demand.

SIGNAL-READING LENSES.
- Silence is not assent. Unspoken does not mean agreed.
- In reorg, budget, or headcount fights, expect loss aversion. People defend what they hold harder than they chase gains.
- The stated reason is rarely the whole reason. Hold the surface claim and the likely real driver apart.
- Deference reveals power. Watch who waits for whom, who gets interrupted, and whose objection ends the discussion.
- One data point is low confidence. A single remark sets a hypothesis, not a fixed read.

STANCE VOCABULARY. supportive, resistant, neutral, unknown. Unknown is a valid and terminal value. Do not resolve unknown into a guess to seem useful.

OUTPUT CONTRACT.
- A saved note applies verbatim and immediately. It is the user's record, not a suggestion.
- Stance, grid placement of power and interest, and influence are suggestions. Each carries a reason of twelve words or fewer that names the signal behind it. Each is independently acceptable, so the user may keep one and drop another.
- When the signal does not support an inference, return unknown or omit the field. Never fabricate a value to fill the shape.
`.trim();

export const GLOBAL_LEARNINGS_VERSION = "global-learnings-v1-2026-06-09";
export const GLOBAL_LEARNINGS = `
Global learnings. Curated, name-agnostic phrasing-to-mapping heuristics that hold across users. They refine the framework signals above with concrete phrasings. [person] and [other] stand for whoever the user names. Apply a rule only when the note matches it; the framework grounding still governs.

- "[person] rubber-stamped it" or "did not push back" -> interest: low, not stance: supportive. Compliance is not engagement.
- "others run things past [person]" or "wait for [person]'s read" -> power: high. Deference reveals power.
- "[person] went quiet after raising concerns" -> stance: unknown. Silence is not assent.
- "[person] keeps re-raising the same objection" -> interest: high, stance: resistant.
- "[person] signs off on budget, headcount, or scope" -> power: high. Resource control.
- "needs [person]'s approval" or "[person] can block this" -> influence: high. Decision gate on this decision.
- "[person] was cc'd but has not weighed in" -> interest: low, stance: unknown. Non-response is not agreement.
- "[person] is championing this" or "pushing hard for it" -> interest: high, stance: supportive.
- "[person] reports to [other]" -> edge defers from [person] to [other]. One reporting line is one defers edge, nothing more.
- "[person] gets interrupted or talked over" -> power: low. Low deference.
- "[person] agreed in the room but has not acted" -> stance: unknown. A stated position is not a real interest; watch behavior.
- "[person] only cares how this hits their team or headcount" -> interest: high, with a SCARF status or fairness threat and a guarded stance.
`.trim();

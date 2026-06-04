/**
 * Input harness for the open (non-command) chat. This is the cheap, deterministic
 * first line of defense that runs BEFORE any model call: it blocks empty input,
 * oversized input, jailbreak / prompt-injection attempts, and short pure-abuse
 * messages, returning a calm redirect with no token spend. Anything that passes
 * goes to the grounded strategist, which is the second line of defense (it stays
 * on the room, declines off-topic, converts profanity to professional behavior,
 * never diagnoses, and ignores instructions embedded in the text).
 *
 * Venting that contains profanity but also real room content is intentionally
 * allowed through to the strategist, which neutralizes it. Only short, content-
 * free abuse is blocked here.
 */

const MAX_LEN = 1000;

const JAILBREAK = [
  /ignore (all|any|the|your|previous|prior)\b/i,
  /disregard (all|any|the|your|previous|prior)?.*(instruction|rule|prompt)/i,
  /system prompt/i,
  /\byou are now\b/i,
  /pretend (you|to be|that)/i,
  /\bact as\b/i,
  /roleplay/i,
  /\bjailbreak\b/i,
  /\bDAN\b/,
  /reveal.*(prompt|instructions|system)/i,
  /what (is|are) your (instructions|system prompt|rules)/i,
  /developer mode/i,
];

const ABUSE = [
  /\bf+u+c+k/i,
  /\bs+h+i+t/i,
  /\basshole/i,
  /\bidiot/i,
  /\bstupid/i,
  /\bmoron/i,
  /\bdumb(ass)?/i,
  /\bbitch/i,
  /\bretard/i,
  /\bjerk\b/i,
  /\bloser\b/i,
  /\bscumbag/i,
  /\bshut up\b/i,
];

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * @param {string} text
 * @returns {{ ok: true } | { blocked: true, reason: string, reply: string }}
 */
export function screenOpenMessage(text) {
  const t = String(text || "").trim();
  if (!t) {
    return { blocked: true, reason: "empty", reply: "Ask a question or share an observation about the room and the people in it." };
  }
  if (t.length > MAX_LEN) {
    return { blocked: true, reason: "too_long", reply: "That is a lot at once. Ask one focused question about the room and I will work it." };
  }
  if (JAILBREAK.some((re) => re.test(t))) {
    return {
      blocked: true,
      reason: "jailbreak",
      reply: "I only help with this room and decision, and I cannot change those rules. What are you trying to get through, and who is involved?",
    };
  }
  if (ABUSE.some((re) => re.test(t)) && wordCount(t) <= 6) {
    return {
      blocked: true,
      reason: "abuse",
      reply: "Let us keep it about the work. Tell me the decision and the person who is in your way, and I will help you move them.",
    };
  }
  return { ok: true };
}

const MAX_TEXT = 700;
const MAX_NOTE = 240;
const MAX_ITEMS = 16;

const EDGE_TYPES = new Set(["ally", "conflict", "defers"]);
const POSITIONS = new Set(["for", "against", "neutral", "unknown"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const TKI = new Set(["Competing", "Avoiding", "Compromising", "Collaborating", "Accommodating"]);
const SCARF = new Set(["Status", "Certainty", "Autonomy", "Relatedness", "Fairness"]);

function cleanText(value, max = MAX_TEXT) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanParagraph(value, max = MAX_TEXT) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Reject out-of-range values rather than fabricating a near-max placement.
  if (n < 0 || n > 100) return null;
  // 0 and 100 are valid absolutes; storage clamps them to the 3 to 97 plot range.
  return Math.max(3, Math.min(97, Math.round(n)));
}

function cleanConfidence(value) {
  return CONFIDENCE.has(value) ? value : undefined;
}

function cleanProfilePatch(patch) {
  if (!patch || typeof patch !== "object") return null;
  const baseRead = patch.baseRead || {};
  const visualTags = patch.visualTags || {};
  const scarfDimensions = Array.isArray(visualTags.scarfDimensions)
    ? visualTags.scarfDimensions.filter((d) => SCARF.has(d)).slice(0, 5)
    : undefined;
  const tkiStyle = TKI.has(visualTags.tkiStyle) ? visualTags.tkiStyle : undefined;
  const out = {
    goal: cleanParagraph(patch.goal, 500),
    context: cleanParagraph(patch.context, 500),
    baseRead: {
      scarf: cleanParagraph(baseRead.scarf, 600),
      tki: cleanParagraph(baseRead.tki, 600),
      cialdini: cleanParagraph(baseRead.cialdini, 600),
      fisherUry: cleanParagraph(baseRead.fisherUry, 600),
    },
    visualTags: {
      scarfDimensions,
      tkiStyle,
      cialdiniLever: cleanText(visualTags.cialdiniLever, 90),
      fuTeaser: cleanText(visualTags.fuTeaser, 160),
    },
  };
  if (!out.goal) delete out.goal;
  if (!out.context) delete out.context;
  Object.keys(out.baseRead).forEach((key) => !out.baseRead[key] && delete out.baseRead[key]);
  Object.keys(out.visualTags).forEach((key) => {
    const value = out.visualTags[key];
    if (!value || (Array.isArray(value) && value.length === 0)) delete out.visualTags[key];
  });
  if (Object.keys(out.baseRead).length === 0) delete out.baseRead;
  if (Object.keys(out.visualTags).length === 0) delete out.visualTags;
  return Object.keys(out).length ? out : null;
}

const TURN_TYPES = new Set(["user", "updated", "note", "added", "fallback", "coach", "read"]);
const RECENT_TURNS = 8;

function recentTurnsFrom(messages = []) {
  return (messages || [])
    .filter((m) => TURN_TYPES.has(m.type))
    .slice(-RECENT_TURNS)
    .map((m) => ({
      role: m.type === "user" ? "user" : "assistant",
      text: cleanText(m.body || m.text || (m.personName ? `Saved a note on ${m.personName}` : ""), 240),
    }))
    .filter((t) => t.text);
}

export function compactRoomCommandContext({ room, decision, participants, edges, messages }) {
  return {
    recentTurns: recentTurnsFrom(messages),
    room: {
      id: cleanText(room?.id, 120),
      name: cleanText(room?.name, 160),
    },
    decision: {
      id: cleanText(decision?.id, 120),
      title: cleanText(decision?.title, 160),
      context: {
        deciding: cleanParagraph(decision?.context?.deciding, 700),
        goal: cleanParagraph(decision?.context?.goal, 700),
        constraint: cleanParagraph(decision?.context?.constraint, 700),
      },
    },
    people: (participants || []).slice(0, 20).map((p) => ({
      id: cleanText(p.id, 120),
      name: cleanText(p.name, 120),
      role: cleanText(p.role, 120),
      isSelf: Boolean(p.isSelf),
      currentPosition: cleanText(decision?.positions?.[p.id] || "unknown", 40),
      currentPlacement: decision?.placements?.[p.id] || null,
      goal: cleanParagraph(p.goal, 400),
      context: cleanParagraph(p.context, 400),
      recentNotes: (p.observations || []).slice(-3).map((o) => cleanParagraph(o.text, 220)),
    })),
    edges: (edges || []).slice(0, 40).map((e) => ({
      from: cleanText(e.from, 120),
      to: cleanText(e.to, 120),
      type: EDGE_TYPES.has(e.type) ? e.type : "defers",
    })),
  };
}

/**
 * Validate a strategist answer. Grounds cites to known participant ids and drops
 * anything outside the room, so the coach cannot reference invented people.
 */
// Strip em/en dashes used as connectors, enforcing the no-em-dash house style
// regardless of what the model returns.
function stripDashes(value) {
  return String(value || "").replace(/\s*[—–]\s*/g, ", ");
}

export function normalizeStrategistAnswer(raw, participants = []) {
  if (!raw || typeof raw !== "object") return null;
  const known = new Set((participants || []).map((p) => p.id));
  const answer = stripDashes(cleanParagraph(raw.answer, 1400));
  if (!answer) return null;
  const grounded = raw.grounded !== false;
  // A decline carries no moves, deterministically, even if the model returns some.
  const moves = grounded
    ? (Array.isArray(raw.moves) ? raw.moves : [])
        .slice(0, 3)
        .map((m) => stripDashes(cleanText(m, 300)))
        .filter(Boolean)
    : [];
  const cites = [...new Set((Array.isArray(raw.cites) ? raw.cites : []).map((c) => cleanText(c, 120)))]
    .filter((id) => known.has(id))
    .slice(0, 12);
  return { kind: "coach", answer, moves, cites, grounded };
}

export function normalizeRoomUpdate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const people = (Array.isArray(raw.people) ? raw.people : [])
    .slice(0, MAX_ITEMS)
    .map((p) => {
      const power = clampPercent(p.power);
      const interest = clampPercent(p.interest);
      const position = POSITIONS.has(p.position) ? p.position : undefined;
      const profilePatch = cleanProfilePatch(p.profilePatch);
      return {
        id: cleanText(p.id, 120),
        name: cleanText(p.name, 120),
        role: cleanText(p.role, 140),
        create: Boolean(p.create),
        note: cleanText(p.note, MAX_NOTE),
        position,
        power,
        interest,
        confidence: cleanConfidence(p.confidence),
        profilePatch,
      };
    })
    .filter((p) => p.id || p.name);

  const edges = (Array.isArray(raw.edges) ? raw.edges : [])
    .slice(0, MAX_ITEMS)
    .map((e) => ({
      from: cleanText(e.from, 120),
      to: cleanText(e.to, 120),
      type: EDGE_TYPES.has(e.type) ? e.type : "defers",
      confidence: cleanConfidence(e.confidence),
      note: cleanText(e.note, MAX_NOTE),
    }))
    .filter((e) => e.from && e.to && e.from !== e.to);

  const openQuestions = (Array.isArray(raw.openQuestions) ? raw.openQuestions : [])
    .slice(0, 2)
    .map((q) => cleanText(q, 180))
    .filter(Boolean);

  return {
    summary: cleanText(raw.summary, 240),
    decisionNote: cleanText(raw.decisionNote, 300),
    people,
    edges,
    openQuestions,
  };
}

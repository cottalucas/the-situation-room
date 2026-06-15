const MAX_TEXT = 700;
const MAX_NOTE = 240;
const MAX_ITEMS = 16;

const EDGE_TYPES = new Set(["ally", "conflict", "defers"]);
const POSITIONS = new Set(["for", "against", "neutral", "unknown"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const INFLUENCE = new Set(["high", "medium", "low"]);
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

// A valid influence level, or null for "insufficient signal". Anything else is
// treated as null so the apply path never sets a bogus level.
function cleanInfluence(value) {
  return INFLUENCE.has(value) ? value : null;
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

// Accept a legacy string move or { move|text, framework }. The framework lever is
// optional: keep it only when present and non-empty, never as an empty string, so
// an unsupported lever is omitted rather than faked. Unknown is a valid answer.
function normalizeMove(m) {
  if (typeof m === "string") {
    const move = stripDashes(cleanText(m, 300));
    return move ? { move } : null;
  }
  if (m && typeof m === "object") {
    const move = stripDashes(cleanText(m.move ?? m.text, 300));
    if (!move) return null;
    const framework = stripDashes(cleanText(m.framework, 120));
    return framework ? { move, framework } : { move };
  }
  return null;
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
        .map(normalizeMove)
        .filter(Boolean)
    : [];
  const cites = [...new Set((Array.isArray(raw.cites) ? raw.cites : []).map((c) => cleanText(c, 120)))]
    .filter((id) => known.has(id))
    .slice(0, 12);
  return { kind: "coach", answer, moves, cites, grounded };
}

/**
 * Which destinations a command is allowed to write. Network now owns influence
 * (ring placement) in addition to edges, but never grid (power/interest) — that
 * stays on the Energy lens. Keeping this pure and shared lets the offline evals
 * assert the boundary without standing up React.
 */
export function commandCapabilities(sourceCommand) {
  // @note now carries the full focus-person extraction (stance, grid, influence,
  // edges) to match the onboarding/@map contract, so it writes to every lens the
  // note text supports, not observations only.
  return {
    notes: sourceCommand === "note" || sourceCommand === "map" || sourceCommand === "create",
    profile: sourceCommand === "note" || sourceCommand === "map" || sourceCommand === "create",
    grid: sourceCommand === "note" || sourceCommand === "grid" || sourceCommand === "map" || sourceCommand === "create",
    edges: sourceCommand === "note" || sourceCommand === "network" || sourceCommand === "map" || sourceCommand === "create",
    influence: sourceCommand === "note" || sourceCommand === "network" || sourceCommand === "map" || sourceCommand === "create",
  };
}

/**
 * Decide what to do with one person's inferred influence level:
 *   "write" — apply the level
 *   "ask"   — uncertain, surface a clarifying question instead of writing
 *   "skip"  — nothing to do (no level, self, or a hand-set level we must respect)
 * Confidence gates only @network, where confidence speaks to influence directly.
 * For @map/@create the confidence field describes the grid read, so it does not
 * block an influence write there (preserving existing behavior).
 */
export function influenceDecision(item, current = {}, command) {
  if (!item || !item.influenceLevel) return "skip";
  if (current.isSelf) return "skip";
  if (current.overridden) return "skip"; // a level the user set by hand wins
  if (command === "network" && item.confidence === "low") return "ask";
  return "write";
}


/**
 * Validate the controller output (the evolved intent classifier). Anything
 * off-contract becomes "unclear" at low confidence, so a malformed model
 * response never routes. A map/both intent always carries a mapping command;
 * an off-contract command falls back to the broad "map" intake.
 */
const CONTROLLER_INTENTS = new Set(["map", "advise", "both", "unclear"]);
const CONTROLLER_COMMANDS = new Set(["note", "energy", "network", "map"]);

// The controller speaks the user-facing surface name "energy"; the mapper's
// server command is "grid" (the Energy lens writes the grid fields). Translate
// once, here, so a controller command never reaches /interpret-room-command as
// "energy", which is not in the server's ALLOWED_COMMANDS. note/network/map pass
// through; anything missing or off-contract falls back to the broad "map" intake.
const CONTROLLER_TO_SERVER_COMMAND = { energy: "grid", note: "note", network: "network", map: "map" };
export function serverCommandForControllerCommand(command) {
  return CONTROLLER_TO_SERVER_COMMAND[command] || "map";
}

export function normalizeClassification(raw) {
  if (!raw || typeof raw !== "object") return { intent: "unclear", command: null, cleanedIntent: "", confidence: "low", clarifyingQuestion: "" };
  const validIntent = CONTROLLER_INTENTS.has(raw.intent);
  const intent = validIntent ? raw.intent : "unclear";
  const needsCommand = intent === "map" || intent === "both";
  const command = needsCommand ? (CONTROLLER_COMMANDS.has(raw.command) ? raw.command : "map") : null;
  // A malformed or unclear intent never carries usable confidence into routing.
  const confidence = validIntent && CONFIDENCE.has(raw.confidence) ? raw.confidence : "low";
  // Accept both the raw model keys (snake_case) and an already-normalized
  // object (camelCase): the client re-normalizes the Function's response.
  return {
    intent,
    command,
    cleanedIntent: cleanText(raw.cleaned_intent ?? raw.cleanedIntent, 500),
    confidence,
    clarifyingQuestion: cleanText(raw.clarifying_question ?? raw.clarifyingQuestion, 240),
  };
}

/**
 * Decide what the app does with a controller read, given the routing flag.
 * Sequenced dispatch table, never an LLM-to-LLM loop:
 * - unclear or low confidence: "clarify". The controller asks its one clarifying
 *   question and never guesses. Nothing mutates.
 * Flag OFF (production default): nothing mutates on its own. A confident read
 *   surfaces a tappable pill; state only changes when the user taps it.
 * Flag ON  (after offline evals pass): high routes silently with a "treated as"
 *   label, medium routes with a confirmation note.
 * Pure, so the dispatch table is covered by offline evals.
 */
export function planClassificationAction(classification, enabled) {
  const { intent, command, cleanedIntent, confidence, clarifyingQuestion } = normalizeClassification(classification);
  if (intent === "unclear" || confidence === "low") {
    return { action: "clarify", intent: "unclear", command: null, confidence, question: clarifyingQuestion };
  }
  if (!enabled) return { action: "pill", intent, command, confidence, cleanedIntent };
  if (confidence === "high") return { action: "route", intent, command, confidence, cleanedIntent };
  return { action: "confirm", intent, command, confidence, cleanedIntent };
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
        influenceLevel: cleanInfluence(p.influenceLevel),
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

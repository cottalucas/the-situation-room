const MAX_TEXT = 900;
const MAX_HEADLINE = 280;
const MAX_STEPS = 4;
const MAX_REASONING = 2;

function cleanText(value, max = MAX_TEXT) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanLongText(value, max = 1400) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function personLookup(participants) {
  const lookup = new Map();
  (participants || []).forEach((p) => {
    if (!p?.id) return;
    lookup.set(String(p.id).toLowerCase(), p.id);
    const first = String(p.name || "").split(/\s+/)[0]?.toLowerCase();
    if (first) lookup.set(first, p.id);
    const full = String(p.name || "").toLowerCase();
    if (full) lookup.set(full, p.id);
  });
  return lookup;
}

function matchPersonId(value, lookup, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const key = raw.toLowerCase();
  return lookup.get(key) || fallback || raw;
}

export function normalizePlay(raw, participants = []) {
  if (!raw || typeof raw !== "object") return null;
  const lookup = personLookup(participants);
  const firstId = participants[0]?.id || "";
  const headline = cleanText(raw.headline, MAX_HEADLINE);
  const sourceSteps = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = sourceSteps.slice(0, MAX_STEPS).map((step, index) => ({
    n: Number.isFinite(Number(step?.n)) ? Number(step.n) : index + 1,
    person: matchPersonId(step?.person, lookup, firstId),
    framework: cleanText(step?.framework, 90),
    text: cleanText(step?.text),
  }));
  const risk = {
    text: cleanText(raw.risk?.text),
    signal: cleanText(raw.risk?.signal),
  };
  const reasoning = (Array.isArray(raw.reasoning) ? raw.reasoning : [])
    .slice(0, MAX_REASONING)
    .map((section) => ({
      title: cleanText(section?.title, 80),
      body: cleanLongText(section?.body),
    }))
    .filter((section) => section.title && section.body);

  if (!headline || steps.length < 2 || !risk.text || !risk.signal || reasoning.length < 1) {
    return null;
  }

  const sequenceSource = Array.isArray(raw.sequence) && raw.sequence.length ? raw.sequence : steps.map((s) => s.person);
  const sequence = sequenceSource.slice(0, MAX_STEPS).map((id) => matchPersonId(id, lookup, firstId)).filter(Boolean);

  return {
    kind: "play",
    headline,
    steps,
    sequence,
    risk,
    reasoning,
  };
}

export function compactContext(ctx) {
  const decision = ctx?.decision || {};
  const participants = Array.isArray(ctx?.participants) ? ctx.participants : [];
  const edges = Array.isArray(ctx?.edges) ? ctx.edges : [];

  return {
    decision: {
      title: cleanText(decision.title, 160),
      context: {
        deciding: cleanLongText(decision.context?.deciding, 900),
        goal: cleanLongText(decision.context?.goal, 900),
        constraint: cleanLongText(decision.context?.constraint, 900),
      },
      decisionNotes: (decision.decisionNotes || []).slice(-5).map((n) => cleanLongText(n, 700)),
      derivedSummary: cleanLongText(decision.derivedSummary, 900),
      deadline: cleanText(decision.deadline, 80),
    },
    participants: participants.slice(0, 12).map((p) => ({
      id: cleanText(p.id, 90),
      name: cleanText(p.name, 120),
      role: cleanText(p.role, 120),
      goal: cleanLongText(p.goal, 700),
      position: cleanText(p.position, 40),
      baseRead: {
        scarf: cleanLongText(p.baseRead?.scarf, 700),
        tki: cleanLongText(p.baseRead?.tki, 700),
        cialdini: cleanLongText(p.baseRead?.cialdini, 700),
        fisherUry: cleanLongText(p.baseRead?.fisherUry, 700),
      },
      relationships: (p.relationships || []).slice(0, 12).map((r) => ({
        personId: cleanText(r.personId, 90),
        type: cleanText(r.type, 40),
      })),
      recentObservations: (p.recentObservations || []).slice(-5).map((o) => cleanLongText(o, 500)),
    })),
    edges: edges.slice(0, 30).map((e) => ({
      from: cleanText(e.from, 90),
      to: cleanText(e.to, 90),
      type: cleanText(e.type, 40),
    })),
  };
}

/**
 * Assembles the prompt context for a decision. This is what the Claude call
 * will receive. It caps observations at a recent window and leans on the
 * decision's derivedSummary instead of sending full history, to keep the prompt
 * tight and the cost down.
 *
 * TODO: Claude API (next prompt). buildContext returns the payload; generatePlay
 * stubs the call and returns the canned play for now.
 */

import { getResponse } from "./reasoning.js";
import { auth } from "./firebase.js";
import { compactContext, normalizePlay } from "./play-contract.js";
import { compactRoomCommandContext, normalizeRoomUpdate, normalizeStrategistAnswer, normalizeClassification } from "./room-command-contract.js";

const RECENT_OBSERVATIONS = 5;

async function apiHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token = await auth?.currentUser?.getIdToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * @param {Object} args
 * @param {Object} args.decision      the active decision (context, notes, summary)
 * @param {Array}  args.participants  people in the decision
 * @param {Array}  args.edges         decision edges
 * @returns {Object} the context payload for the model
 */
export function buildContext({ decision, participants, edges }) {
  return {
    decision: {
      title: decision.title,
      context: decision.context,
      decisionNotes: (decision.decisionNotes || []).map((n) => n.text),
      derivedSummary: decision.derivedSummary || "",
      deadline: decision.deadline || "",
    },
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      goal: p.goal,
      position: decision.positions?.[p.id] || "unknown",
      baseRead: p.baseRead,
      relationships: p.relationships || [],
      // recent memory only, not the full log
      recentObservations: (p.observations || []).slice(-RECENT_OBSERVATIONS).map((o) => o.text),
    })),
    edges: (edges || []).map((e) => ({ from: e.from, to: e.to, type: e.type })),
  };
}

/**
 * Generate a play for a situation. Stubbed: returns the canned reasoning for now
 * but takes the assembled context so the swap to a live call is one function.
 *
 * @returns {Promise<Object>} the play or fallback response
 */
export async function generatePlay(situation, ctx) {
  const liveEnabled = import.meta.env.VITE_ENABLE_LIVE_LLM === "true";
  if (!liveEnabled) return getResponse(situation, ctx.participants, ctx.decision.context);

  try {
    const res = await fetch("/api/generate-play", {
      method: "POST",
      headers: await apiHeaders(),
      body: JSON.stringify({ situation, context: compactContext(ctx) }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const trace = error?.meta?.traceId ? ` Trace: ${error.meta.traceId}.` : "";
      throw new Error(`${error?.error || "The local reasoning service is not ready."}${trace}`);
    }
    const data = await res.json();
    const play = normalizePlay(data?.play, ctx.participants);
    if (play) return play;
    throw new Error("The model returned an incomplete play.");
  } catch (err) {
    return {
      kind: "fallback",
      body:
        err?.message ||
        "The live reasoning pass failed. The local prototype can still run with the canned play while the connection is fixed.",
    };
  }
}

export async function askStrategist({ question, room, decision, participants, edges, messages }) {
  const liveEnabled = import.meta.env.VITE_ENABLE_LIVE_LLM === "true";
  if (!liveEnabled) {
    return {
      kind: "fallback",
      body: "Live local reasoning is off. Turn on VITE_ENABLE_LIVE_LLM to ask the strategist.",
    };
  }
  try {
    const res = await fetch("/api/strategist", {
      method: "POST",
      headers: await apiHeaders(),
      body: JSON.stringify({
        question,
        context: compactRoomCommandContext({ room, decision, participants, edges, messages }),
      }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const trace = error?.meta?.traceId ? ` Trace: ${error.meta.traceId}.` : "";
      throw new Error(`${error?.error || "The strategist is not ready."}${trace}`);
    }
    const data = await res.json();
    const answer = normalizeStrategistAnswer(data?.answer, participants);
    if (!answer) throw new Error("The strategist returned an incomplete answer.");
    return { kind: "coach", answer };
  } catch (err) {
    return { kind: "fallback", body: err?.message || "The strategist pass failed." };
  }
}

/**
 * Run plain text through the controller (the evolved intent classifier). Cheap
 * single call, never mutates anything. Only the text is sent, never the room
 * context, and the caller never logs the raw text. Returns a normalized
 * { intent, command, cleanedIntent, confidence, clarifyingQuestion }.
 */
const UNCLEAR_CLASSIFICATION = { intent: "unclear", command: null, cleanedIntent: "", confidence: "low", clarifyingQuestion: "" };

export async function classifyIntent(text) {
  const liveEnabled = import.meta.env.VITE_ENABLE_LIVE_LLM === "true";
  if (!liveEnabled) return { kind: "fallback", classification: { ...UNCLEAR_CLASSIFICATION } };
  try {
    const res = await fetch("/api/classify-intent", {
      method: "POST",
      headers: await apiHeaders(),
      body: JSON.stringify({ text: String(text || "").slice(0, 700) }),
    });
    if (!res.ok) throw new Error("classify failed");
    const data = await res.json();
    return { kind: "ok", classification: normalizeClassification(data?.classification) };
  } catch {
    // A failed controller read degrades to "unclear", never to a silent mutation.
    return { kind: "fallback", classification: { ...UNCLEAR_CLASSIFICATION } };
  }
}

/**
 * Capture one confirmed or corrected mapping into the user's private example
 * store. Fire-and-forget: the Function name-redacts the phrasing at write time, so
 * raw note text and names never persist. The browser sends the note plus the names
 * to redact (room participants); the Function stores only the redacted pattern.
 * Never throws and never blocks the UI.
 *
 * @param {Object} args
 * @param {string} args.phrasing        raw note text (redacted server-side, not stored)
 * @param {string[]} args.redactNames   participant names/first names to redact
 * @param {string} args.mappingOutcome  the band/stance/level that was committed
 * @param {string} args.axis            power | interest | stance | influence
 * @param {string} args.action          accept | adjust | skip
 * @param {string} args.confidence      high | medium | low
 * @param {boolean} args.wasAdjusted    true when the user corrected the suggestion
 */
export async function captureExample({ phrasing, redactNames, mappingOutcome, axis, action, confidence, wasAdjusted }) {
  const liveEnabled = import.meta.env.VITE_ENABLE_LIVE_LLM === "true";
  if (!liveEnabled || !phrasing || !axis || !mappingOutcome) return;
  try {
    await fetch("/api/capture-example", {
      method: "POST",
      headers: await apiHeaders(),
      body: JSON.stringify({
        phrasing,
        redactNames: Array.isArray(redactNames) ? redactNames : [],
        mappingOutcome,
        axis,
        action: action || "accept",
        confidence: confidence || "low",
        wasAdjusted: Boolean(wasAdjusted),
      }),
    });
  } catch {
    // Best-effort personalization. Never surface a capture failure to the user.
  }
}

export async function interpretRoomCommand({ command, text, room, decision, participants, edges, focusPerson, messages, instruction }) {
  const liveEnabled = import.meta.env.VITE_ENABLE_LIVE_LLM === "true";
  if (!liveEnabled) {
    return {
      kind: "fallback",
      body: "Live local reasoning is off. Turn on VITE_ENABLE_LIVE_LLM to use mapping commands.",
    };
  }

  try {
    const res = await fetch("/api/interpret-room-command", {
      method: "POST",
      headers: await apiHeaders(),
      body: JSON.stringify({
        command,
        text,
        // The controller's cleaned_intent, when this call came through the
        // plain-text relay. The mapper trusts it for intent; the verbatim text
        // stays the source for saved notes.
        instruction: instruction || null,
        focusPerson: focusPerson
          ? { id: focusPerson.id, name: focusPerson.name, role: focusPerson.role }
          : null,
        context: compactRoomCommandContext({ room, decision, participants, edges, messages }),
      }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const trace = error?.meta?.traceId ? ` Trace: ${error.meta.traceId}.` : "";
      throw new Error(`${error?.error || "The local mapping service is not ready."}${trace}`);
    }
    const data = await res.json();
    const update = normalizeRoomUpdate(data?.update);
    if (!update) throw new Error("The model returned an incomplete update.");
    return { kind: "update", update };
  } catch (err) {
    return {
      kind: "fallback",
      body: err?.message || "The local mapping pass failed.",
    };
  }
}

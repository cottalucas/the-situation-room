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
import { compactRoomCommandContext, normalizeRoomUpdate } from "./room-command-contract.js";

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

export async function interpretRoomCommand({ command, text, room, decision, participants, edges, focusPerson }) {
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
        focusPerson: focusPerson
          ? { id: focusPerson.id, name: focusPerson.name, role: focusPerson.role }
          : null,
        context: compactRoomCommandContext({ room, decision, participants, edges }),
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

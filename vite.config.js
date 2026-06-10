import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { normalizePlay } from "./src/lib/play-contract.js";
import { normalizeRoomUpdate, normalizeStrategistAnswer, normalizeClassification } from "./src/lib/room-command-contract.js";
import {
  COMMAND_PROMPT_VERSION,
  COMMAND_SYSTEM_PROMPT,
  PLAY_PROMPT_VERSION,
  PLAY_SYSTEM_PROMPT,
  STRATEGIST_PROMPT_VERSION,
  STRATEGIST_SYSTEM_PROMPT,
  CONTROLLER_PROMPT_VERSION,
  CONTROLLER_SYSTEM_PROMPT,
  playPrompt,
  roomCommandPrompt,
  strategistPrompt,
  controllerPrompt,
} from "./src/lib/llm-prompts.js";
import { estimateCostUsd, makeTraceId, writeLlmTrace } from "./src/lib/llm-trace.js";
import { buildExample } from "./functions/learning-store.js";

const MAX_BODY_BYTES = 120_000;
const ANTHROPIC_VERSION = "2023-06-01";

function isLocalRequest(req) {
  const addr = req.socket?.remoteAddress || "";
  return addr === "::1" || addr === "127.0.0.1" || addr === "::ffff:127.0.0.1";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request is too large."));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        return null;
      }
    }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function localAnthropicPlugin(env) {
  const apiKey = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || env.ANTHROPIC_MODEL || env.LLM_PLAY_MODEL || "claude-haiku-4-5-20251001";
  const liveEnabled = process.env.VITE_ENABLE_LIVE_LLM === "true" || env.VITE_ENABLE_LIVE_LLM === "true";

  async function callAnthropicJson({ system, content, maxTokens = 2200 }) {
    const started = Date.now();
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content }],
      }),
    });

    const anthropicJson = await anthropicRes.json().catch(() => ({}));
    const latencyMs = Date.now() - started;
    if (!anthropicRes.ok) {
      const err = new Error(anthropicJson?.error?.message || "Anthropic request failed.");
      err.status = anthropicRes.status;
      err.anthropicJson = anthropicJson;
      err.latencyMs = latencyMs;
      throw err;
    }

    const text = (anthropicJson.content || [])
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join("\n");
    return { parsed: extractJson(text), rawText: text, rawResponse: anthropicJson, usage: anthropicJson.usage || null, latencyMs };
  }

  function maxTokensForCommand(command) {
    if (command === "note") return 800;
    if (command === "grid") return 1200;
    if (command === "network" || command === "net") return 2000;
    if (command === "create") return 1800;
    if (command === "map") return 2600;
    return 1200;
  }

  return {
    name: "local-anthropic-play-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/generate-play", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "POST only." });
        if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Local requests only." });
        if (!liveEnabled) return sendJson(res, 404, { error: "Live local LLM is disabled." });
        if (!apiKey) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY is missing in .env.local." });

        try {
          const body = await readBody(req);
          const payload = JSON.parse(body);
          const situation = String(payload?.situation || "").trim().slice(0, 1600);
          const context = payload?.context;
          if (!situation || !context?.decision || !Array.isArray(context?.participants)) {
            return sendJson(res, 400, { error: "Missing situation or decision context." });
          }
          const traceId = makeTraceId({ endpoint: "generate-play", command: "play" });
          const content = playPrompt({ situation, context });
          const started = Date.now();
          const { parsed, rawText, rawResponse, usage, latencyMs } = await callAnthropicJson({
            system: PLAY_SYSTEM_PROMPT,
            content,
            maxTokens: 1200,
          });
          const play = normalizePlay(parsed, context.participants);
          const estimatedCostUsd = estimateCostUsd(usage, model);
          const trace = writeLlmTrace({
            id: traceId,
            endpoint: "generate-play",
            command: "play",
            status: play ? "ok" : "invalid",
            model,
            maxTokens: 1200,
            latencyMs: Date.now() - started,
            apiLatencyMs: latencyMs,
            usage,
            estimatedCostUsd,
            promptVersions: { play: PLAY_PROMPT_VERSION },
            request: { situation, context },
            system: PLAY_SYSTEM_PROMPT,
            prompt: content,
            rawText,
            rawResponse,
            parsed,
            normalized: play,
            validation: play ? "valid_play" : "invalid_play_shape",
          });
          if (!play) {
            return sendJson(res, 422, {
              error: "Claude returned an invalid play shape.",
              meta: { model, usage, latencyMs: Date.now() - started, estimatedCostUsd, traceId: trace.id, traceFile: trace.file },
            });
          }

          return sendJson(res, 200, {
            play,
            meta: {
              model,
              usage,
              latencyMs: Date.now() - started,
              estimatedCostUsd,
              traceId: trace.id,
              traceFile: trace.file,
            },
          });
        } catch (err) {
          writeLlmTrace({
            endpoint: "generate-play",
            command: "play",
            status: "error",
            model,
            latencyMs: err?.latencyMs || null,
            rawResponse: err?.anthropicJson || null,
            error: err?.message || "Local reasoning endpoint failed.",
          });
          return sendJson(res, err?.status || 500, { error: err?.message || "Local reasoning endpoint failed." });
        }
      });

      server.middlewares.use("/api/strategist", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "POST only." });
        if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Local requests only." });
        if (!liveEnabled) return sendJson(res, 404, { error: "Live local LLM is disabled." });
        if (!apiKey) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY is missing in .env.local." });

        try {
          const body = await readBody(req);
          const payload = JSON.parse(body);
          const question = String(payload?.question || "").trim().slice(0, 1200);
          const context = payload?.context;
          if (!question || !context?.decision || !Array.isArray(context?.people)) {
            return sendJson(res, 400, { error: "Missing question or room context." });
          }
          const traceId = makeTraceId({ endpoint: "strategist", command: "strategist" });
          const content = strategistPrompt({ question, context });
          const started = Date.now();
          const { parsed, rawText, rawResponse, usage, latencyMs } = await callAnthropicJson({
            system: STRATEGIST_SYSTEM_PROMPT,
            content,
            maxTokens: 900,
          });
          const answer = normalizeStrategistAnswer(parsed, context.people);
          const estimatedCostUsd = estimateCostUsd(usage, model);
          const trace = writeLlmTrace({
            id: traceId,
            endpoint: "strategist",
            command: "strategist",
            status: answer ? "ok" : "invalid",
            model,
            maxTokens: 900,
            latencyMs: Date.now() - started,
            apiLatencyMs: latencyMs,
            usage,
            estimatedCostUsd,
            promptVersions: { strategist: STRATEGIST_PROMPT_VERSION },
            request: { question, context },
            system: STRATEGIST_SYSTEM_PROMPT,
            prompt: content,
            rawText,
            rawResponse,
            parsed,
            normalized: answer,
            validation: answer ? "valid_strategist" : "invalid_strategist_shape",
          });
          if (!answer) {
            return sendJson(res, 422, {
              error: "Claude returned an invalid strategist shape.",
              meta: { model, usage, latencyMs: Date.now() - started, estimatedCostUsd, traceId: trace.id, traceFile: trace.file },
            });
          }
          return sendJson(res, 200, {
            answer,
            meta: { model, usage, latencyMs: Date.now() - started, estimatedCostUsd, traceId: trace.id, traceFile: trace.file },
          });
        } catch (err) {
          writeLlmTrace({
            endpoint: "strategist",
            command: "strategist",
            status: "error",
            model,
            latencyMs: err?.latencyMs || null,
            rawResponse: err?.anthropicJson || null,
            error: err?.message || "Local strategist endpoint failed.",
          });
          return sendJson(res, err?.status || 500, { error: err?.message || "Local strategist endpoint failed." });
        }
      });

      server.middlewares.use("/api/classify-intent", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "POST only." });
        if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Local requests only." });
        if (!liveEnabled) return sendJson(res, 404, { error: "Live local LLM is disabled." });
        if (!apiKey) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY is missing in .env.local." });

        try {
          const body = await readBody(req);
          const payload = JSON.parse(body);
          const text = String(payload?.text || "").trim().slice(0, 700);
          if (!text) return sendJson(res, 400, { error: "Missing text." });
          const traceId = makeTraceId({ endpoint: "classify-intent", command: "classify" });
          const content = controllerPrompt(text);
          const started = Date.now();
          // Dev parity gap: the production Function appends the per-user idiolect
          // priors below this prompt; the dev bridge does not (the example store
          // is production-only).
          const { parsed, rawText, rawResponse, usage, latencyMs } = await callAnthropicJson({
            system: CONTROLLER_SYSTEM_PROMPT,
            content,
            maxTokens: 300,
          });
          const classification = normalizeClassification(parsed);
          const estimatedCostUsd = estimateCostUsd(usage, model);
          // Trace metadata stays privacy-safe: the routed intent, never the raw text.
          writeLlmTrace({
            id: traceId,
            endpoint: "classify-intent",
            command: "classify",
            status: "ok",
            model,
            maxTokens: 300,
            latencyMs: Date.now() - started,
            apiLatencyMs: latencyMs,
            usage,
            estimatedCostUsd,
            promptVersions: { controller: CONTROLLER_PROMPT_VERSION },
            request: { intent: classification.intent, command: classification.command, confidence: classification.confidence },
            system: CONTROLLER_SYSTEM_PROMPT,
            rawText,
            rawResponse,
            parsed,
            normalized: classification,
            validation: "valid_classification",
          });
          return sendJson(res, 200, { classification, meta: { model, usage, latencyMs: Date.now() - started, estimatedCostUsd, traceId } });
        } catch (err) {
          return sendJson(res, err?.status || 500, { error: err?.message || "Local classify endpoint failed." });
        }
      });

      server.middlewares.use("/api/interpret-room-command", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "POST only." });
        if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Local requests only." });
        if (!liveEnabled) return sendJson(res, 404, { error: "Live local LLM is disabled." });
        if (!apiKey) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY is missing in .env.local." });

        try {
          const body = await readBody(req);
          const payload = JSON.parse(body);
          const command = String(payload?.command || "").trim().slice(0, 40);
          const text = String(payload?.text || "").trim().slice(0, 5000);
          const context = payload?.context;
          const focusPerson = payload?.focusPerson || null;
          const instruction = String(payload?.instruction || "").trim().slice(0, 600) || null;
          if (!command || !text || !context?.decision || !Array.isArray(context?.people)) {
            return sendJson(res, 400, { error: "Missing command text or room context." });
          }

          const maxTokens = maxTokensForCommand(command);
          const traceId = makeTraceId({ endpoint: "interpret-room-command", command });
          const content = roomCommandPrompt({ command, text, context, focusPerson, instruction });
          const started = Date.now();
          const { parsed, rawText, rawResponse, usage, latencyMs } = await callAnthropicJson({
            system: COMMAND_SYSTEM_PROMPT,
            content,
            maxTokens,
          });
          const update = normalizeRoomUpdate(parsed);
          const estimatedCostUsd = estimateCostUsd(usage, model);
          const trace = writeLlmTrace({
            id: traceId,
            endpoint: "interpret-room-command",
            command,
            status: update ? "ok" : "invalid",
            model,
            maxTokens,
            latencyMs: Date.now() - started,
            apiLatencyMs: latencyMs,
            usage,
            estimatedCostUsd,
            promptVersions: { command: COMMAND_PROMPT_VERSION },
            request: { command, text, context, focusPerson, instruction },
            system: COMMAND_SYSTEM_PROMPT,
            prompt: content,
            rawText,
            rawResponse,
            parsed,
            normalized: update,
            validation: update ? "valid_room_update" : "invalid_room_update_shape",
          });
          if (!update) {
            return sendJson(res, 422, {
              error: "Claude returned an invalid mapping shape.",
              meta: { model, usage, latencyMs: Date.now() - started, estimatedCostUsd, traceId: trace.id, traceFile: trace.file },
            });
          }

          return sendJson(res, 200, {
            update,
            meta: {
              model,
              usage,
              latencyMs: Date.now() - started,
              estimatedCostUsd,
              traceId: trace.id,
              traceFile: trace.file,
            },
          });
        } catch (err) {
          writeLlmTrace({
            endpoint: "interpret-room-command",
            command: "unknown",
            status: "error",
            model,
            latencyMs: err?.latencyMs || null,
            rawResponse: err?.anthropicJson || null,
            error: err?.message || "Local mapping endpoint failed.",
          });
          return sendJson(res, err?.status || 500, { error: err?.message || "Local mapping endpoint failed." });
        }
      });

      // Dev parity for the capture path. It redacts the phrasing through the same
      // pure helper the Function uses, so name redaction can be exercised locally,
      // but the dev bridge does not persist examples or inject per-user priors
      // (the example store is a production-only feature, the same accepted parity
      // gap as the server-only grounding and global learnings).
      server.middlewares.use("/api/capture-example", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "POST only." });
        if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Local requests only." });
        try {
          const payload = JSON.parse(await readBody(req));
          const built = buildExample({
            phrasing: payload?.phrasing,
            names: Array.isArray(payload?.redactNames) ? payload.redactNames : [],
            mappingOutcome: payload?.mappingOutcome,
            axis: payload?.axis,
            action: payload?.action,
            confidence: payload?.confidence,
          });
          return sendJson(res, built ? 200 : 400, built ? { ok: true } : { error: "Unusable example." });
        } catch (err) {
          return sendJson(res, 500, { error: err?.message || "Capture endpoint failed." });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), localAnthropicPlugin(env)],
  };
});

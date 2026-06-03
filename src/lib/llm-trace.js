import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_TRACE_DIR = "llm-traces";

const PRICES = {
  "claude-haiku-4-5": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheWritePerMTok: 1.25,
    cacheReadPerMTok: 0.1,
  },
};

function traceDir() {
  return process.env.LLM_TRACE_DIR || path.join(process.cwd(), DEFAULT_TRACE_DIR);
}

function safeName(value) {
  return String(value || "trace")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function priceForModel(model) {
  const key = String(model || "").includes("haiku") ? "claude-haiku-4-5" : "claude-haiku-4-5";
  const defaults = PRICES[key];
  return {
    inputPerMTok: Number(process.env.LLM_INPUT_PRICE_PER_MTOK || defaults.inputPerMTok),
    outputPerMTok: Number(process.env.LLM_OUTPUT_PRICE_PER_MTOK || defaults.outputPerMTok),
    cacheWritePerMTok: Number(process.env.LLM_CACHE_WRITE_PRICE_PER_MTOK || defaults.cacheWritePerMTok),
    cacheReadPerMTok: Number(process.env.LLM_CACHE_READ_PRICE_PER_MTOK || defaults.cacheReadPerMTok),
  };
}

export function estimateCostUsd(usage, model) {
  const u = usage || {};
  const p = priceForModel(model);
  const input = Number(u.input_tokens || 0);
  const output = Number(u.output_tokens || 0);
  const cacheWrite = Number(u.cache_creation_input_tokens || 0);
  const cacheRead = Number(u.cache_read_input_tokens || 0);
  const usd =
    (input * p.inputPerMTok + output * p.outputPerMTok + cacheWrite * p.cacheWritePerMTok + cacheRead * p.cacheReadPerMTok) / 1_000_000;
  return Number(usd.toFixed(8));
}

export function makeTraceId({ endpoint, command }) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = crypto.randomBytes(4).toString("hex");
  return `${ts}_${safeName(endpoint)}_${safeName(command || "play")}_${rand}`;
}

export function writeLlmTrace(trace) {
  const dir = traceDir();
  fs.mkdirSync(dir, { recursive: true });
  const id = trace.id || makeTraceId(trace);
  const next = {
    ...trace,
    id,
    ts: trace.ts || new Date().toISOString(),
  };
  const file = path.join(dir, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(next, null, 2));

  const summary = {
    id,
    ts: next.ts,
    endpoint: next.endpoint,
    command: next.command || null,
    status: next.status,
    model: next.model,
    latencyMs: next.latencyMs,
    usage: next.usage || null,
    estimatedCostUsd: next.estimatedCostUsd || 0,
    validation: next.validation || null,
    error: next.error || null,
    file,
  };
  fs.appendFileSync(path.join(dir, "index.ndjson"), `${JSON.stringify(summary)}\n`);
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(summary, null, 2));
  return { id, file };
}

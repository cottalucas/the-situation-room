#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const dir = process.env.LLM_TRACE_DIR || path.join(process.cwd(), "llm-traces");
const indexPath = path.join(dir, "index.ndjson");

if (!fs.existsSync(indexPath)) {
  console.log("No LLM traces yet.");
  process.exit(0);
}

const rows = fs
  .readFileSync(indexPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const totalCost = rows.reduce((sum, r) => sum + Number(r.estimatedCostUsd || 0), 0);
const totalInput = rows.reduce((sum, r) => sum + Number(r.usage?.input_tokens || 0), 0);
const totalOutput = rows.reduce((sum, r) => sum + Number(r.usage?.output_tokens || 0), 0);
const latencies = rows.map((r) => Number(r.latencyMs || 0)).filter((n) => Number.isFinite(n) && n > 0);
const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
const failures = rows.filter((r) => r.status !== "ok");

const byCommand = rows.reduce((acc, r) => {
  const key = r.command || r.endpoint || "unknown";
  acc[key] ||= { count: 0, cost: 0, latency: 0, inputTokens: 0, outputTokens: 0 };
  acc[key].count += 1;
  acc[key].cost += Number(r.estimatedCostUsd || 0);
  acc[key].latency += Number(r.latencyMs || 0);
  acc[key].inputTokens += Number(r.usage?.input_tokens || 0);
  acc[key].outputTokens += Number(r.usage?.output_tokens || 0);
  return acc;
}, {});

// Spend ceiling for the project. Override with LLM_SPEND_CEILING_USD.
const ceiling = Number(process.env.LLM_SPEND_CEILING_USD || 50);

console.log(JSON.stringify(
  {
    traces: rows.length,
    totalCostUsd: Number(totalCost.toFixed(6)),
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    avgLatencyMs: avgLatency,
    budget: {
      ceilingUsd: ceiling,
      spentUsd: Number(totalCost.toFixed(6)),
      remainingUsd: Number((ceiling - totalCost).toFixed(6)),
      percentUsed: Number(((totalCost / ceiling) * 100).toFixed(2)),
    },
    failures: failures.map((r) => ({ id: r.id, status: r.status, error: r.error, file: r.file })),
    byCommand: Object.fromEntries(
      Object.entries(byCommand).map(([key, value]) => [
        key,
        {
          count: value.count,
          costUsd: Number(value.cost.toFixed(6)),
          inputTokens: value.inputTokens,
          outputTokens: value.outputTokens,
          avgTokensPerCall: value.count ? Math.round((value.inputTokens + value.outputTokens) / value.count) : 0,
          avgLatencyMs: value.count ? Math.round(value.latency / value.count) : 0,
        },
      ])
    ),
    latest: rows.at(-1),
  },
  null,
  2
));

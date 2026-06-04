#!/usr/bin/env node
/**
 * Phase C offline checks (no API): a low-confidence read carries the `confidence`
 * field through to the stored placement shape, existing data defaults to high, and
 * only "low" surfaces the needs-confirm dot.
 */
import { buildPlacement, placementNeedsConfirm, normalizeConfidence } from "../src/lib/placement.js";

let passed = 0;
let failed = 0;
function check(name, cond) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? (passed += 1) : (failed += 1);
}

const low = buildPlacement(30, 45, "low");
check("low confidence is carried into the stored shape", low.confidence === "low");
check("stored shape keeps power + interest", low.power === 30 && low.interest === 45);
check("needs-confirm true for low", placementNeedsConfirm(low) === true);

const high = buildPlacement(70, 60, "high");
check("explicit high is high", high.confidence === "high");
check("needs-confirm false for high", placementNeedsConfirm(high) === false);

const missing = buildPlacement(50, 55);
check("missing confidence defaults to high (no migration needed)", missing.confidence === "high");
check("missing confidence does not need confirm", placementNeedsConfirm(missing) === false);

// Legacy stored placement with no confidence field at all (pre-Phase-C data).
check("legacy placement {power,interest} reads as confident", placementNeedsConfirm({ power: 50, interest: 55 }) === false);
check("garbage confidence normalizes to high", normalizeConfidence("banana") === "high");

console.log(`\nPhase C: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

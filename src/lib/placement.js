/**
 * Energy-lens placement helpers. A placement is { power, interest, confidence }.
 * Confidence is additive and backward compatible: existing placements without it
 * are treated as "high" (confident), so no migration is needed. Low confidence is
 * the only state that changes the UI, surfacing a needs-confirm dot — the product
 * showing it is uncertain rather than faking precision.
 */

export const PLACEMENT_CONFIDENCE = new Set(["high", "medium", "low"]);

export function normalizeConfidence(confidence) {
  return PLACEMENT_CONFIDENCE.has(confidence) ? confidence : "high";
}

export function buildPlacement(power, interest, confidence) {
  return { power, interest, confidence: normalizeConfidence(confidence) };
}

/** Missing or non-low confidence reads as confident. Only "low" needs a confirm. */
export function placementNeedsConfirm(placement) {
  return placement?.confidence === "low";
}

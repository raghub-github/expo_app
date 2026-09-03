/**
 * Lightweight confidence-gated typo / did-you-mean for catalog search.
 * Static food-token map — no UI hardcoding of store names.
 */

import { normalizeSearchQuery } from "./searchNormalize.js";

/** Common food typos → canonical token. Keys must be lowercase normalized. */
export const FOOD_TYPO_MAP: Record<string, string> = {
  biriyani: "biryani",
  briyani: "biryani",
  biryani: "biryani",
  momo: "momos",
  momoz: "momos",
  piza: "pizza",
  pizzza: "pizza",
  burgerz: "burger",
  burgr: "burger",
  sandwitch: "sandwich",
  sandwiche: "sandwich",
  chiken: "chicken",
  chickn: "chicken",
  chikenbiryani: "chicken biryani",
  dosa: "dosa",
  dosai: "dosa",
  idly: "idli",
  idliy: "idli",
  noodels: "noodles",
  noddles: "noodles",
  pastaa: "pasta",
  thali: "thali",
  thaali: "thali",
  parata: "paratha",
  parantha: "paratha",
  chaat: "chaat",
  chat: "chaat",
  faluda: "falooda",
  falooda: "falooda",
  rasgula: "rasgulla",
  rasgulla: "rasgulla",
  icecream: "ice cream",
  "ice-cream": "ice cream",
};

const MIN_CONFIDENCE = 0.72;

export type TypoSuggestion = {
  /** Corrected query to run (or suggest). */
  correctedQuery: string;
  /** Human-facing "Did you mean X?" */
  didYouMean: string;
  /** Confidence 0–1; only surface when ≥ MIN_CONFIDENCE. */
  confidence: number;
  /** True when at least one token was rewritten. */
  applied: boolean;
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cur =
        a[i] === b[j] ? row[j]! : 1 + Math.min(row[j]!, row[j + 1]!, prev);
      row[j] = prev;
      prev = cur;
    }
    row[b.length] = prev;
  }
  return row[b.length]!;
}

/** Best map hit or near-miss for a single token. */
function correctToken(token: string): { value: string; conf: number } | null {
  if (FOOD_TYPO_MAP[token]) {
    const v = FOOD_TYPO_MAP[token]!;
    return { value: v, conf: v === token ? 1 : 0.95 };
  }
  let best: { value: string; conf: number } | null = null;
  for (const [typo, canon] of Object.entries(FOOD_TYPO_MAP)) {
    if (Math.abs(typo.length - token.length) > 2) continue;
    const d = levenshtein(token, typo);
    if (d === 0) return { value: canon, conf: 1 };
    if (d > 2) continue;
    const conf = 1 - d / Math.max(token.length, typo.length, 1);
    if (conf < MIN_CONFIDENCE) continue;
    if (!best || conf > best.conf) best = { value: canon, conf };
  }
  return best;
}

/**
 * Suggest a corrected query. Never forces low-confidence corrections.
 * Caller should run search on `original` first; if empty/weak, retry with corrected.
 */
export function suggestTypoCorrection(rawQuery: string): TypoSuggestion | null {
  const { original, normalized, tokens } = normalizeSearchQuery(rawQuery);
  if (!normalized || tokens.length === 0) return null;

  const outTokens: string[] = [];
  let changed = false;
  let minConf = 1;

  for (const t of tokens) {
    const hit = correctToken(t);
    if (hit && hit.value !== t) {
      // Multi-word canon (e.g. "ice cream") — push as separate tokens later via join
      outTokens.push(hit.value);
      changed = true;
      minConf = Math.min(minConf, hit.conf);
    } else if (hit) {
      outTokens.push(hit.value);
    } else {
      outTokens.push(t);
    }
  }

  if (!changed || minConf < MIN_CONFIDENCE) return null;

  const correctedQuery = outTokens.join(" ").replace(/\s+/g, " ").trim();
  if (!correctedQuery || correctedQuery === normalized) return null;

  return {
    correctedQuery,
    didYouMean: correctedQuery,
    confidence: minConf,
    applied: true,
  };
}

export const TYPO_MIN_CONFIDENCE = MIN_CONFIDENCE;

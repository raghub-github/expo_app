/**
 * Catalog search query normalization — trim, NFKC, collapse spaces, strip
 * harmless punctuation without destroying food tokens (e.g. "momos!", "t-bone").
 */

export type NormalizedSearchQuery = {
  /** Original trimmed input (display / "search instead"). */
  original: string;
  /** Lowercased matching form. */
  normalized: string;
  /** Whitespace-split tokens from normalized. */
  tokens: string[];
};

const PUNCT_STRIP = /[^\p{L}\p{N}\s&'+.-]+/gu;
const MULTI_SPACE = /\s+/g;

export function normalizeSearchQuery(raw: string | null | undefined): NormalizedSearchQuery {
  const original = String(raw ?? "").trim();
  if (!original) {
    return { original: "", normalized: "", tokens: [] };
  }
  let n = original.normalize("NFKC").toLowerCase();
  n = n.replace(PUNCT_STRIP, " ");
  n = n.replace(MULTI_SPACE, " ").trim();
  const tokens = n.split(" ").filter((t) => t.length > 0);
  return { original, normalized: n, tokens };
}

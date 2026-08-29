/** One merchant reply on a store rating. Keep payloads small — no extra tables. */
export type MerchantReviewReply = {
  text: string;
  at: string;
  images?: string[];
};

function toIso(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : value.trim();
  }
  return new Date().toISOString();
}

export function parseMerchantReviewReplies(
  responses: unknown,
  fallbackText?: string | null,
  fallbackAt?: string | null,
): MerchantReviewReply[] {
  let raw: unknown = responses;
  if (typeof raw === "string" && raw.trim()) {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      raw = null;
    }
  }
  const fromJson: MerchantReviewReply[] = [];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const rec = row as { text?: unknown; at?: unknown; images?: unknown };
      const text = typeof rec.text === "string" ? rec.text.trim() : "";
      const images = Array.isArray(rec.images)
        ? rec.images.map((u) => String(u).trim()).filter(Boolean)
        : [];
      if (!text && images.length === 0) continue;
      fromJson.push({
        text,
        at: toIso(rec.at),
        ...(images.length > 0 ? { images } : {}),
      });
    }
  }
  if (fromJson.length > 0) return fromJson;

  const legacy = typeof fallbackText === "string" ? fallbackText.trim() : "";
  if (!legacy) return [];
  return [{ text: legacy, at: toIso(fallbackAt) }];
}

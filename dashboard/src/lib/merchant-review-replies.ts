/** One merchant reply on a store rating. Keep payloads small — no extra tables. */
export type MerchantReviewReply = {
  text: string;
  at: string;
  images?: string[];
};

export const MERCHANT_REVIEW_REPLY_CAP = 20;

function toIso(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : value.trim();
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return new Date().toISOString();
}

export function parseMerchantReviewReplies(
  responses: unknown,
  fallbackText?: string | null,
  fallbackAt?: string | Date | null,
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

export function encodeLegacyMerchantResponse(text: string, images?: string[] | null): string {
  const t = text.trim();
  const imgs = (images ?? []).map((u) => String(u).trim()).filter(Boolean);
  if (imgs.length === 0) return t;
  const blob = `[IMAGES:${JSON.stringify(imgs)}]`;
  return t ? `${t}\n\n${blob}` : blob;
}

export function appendMerchantReviewReply(
  existing: unknown,
  fallbackText: string | null | undefined,
  fallbackAt: string | Date | null | undefined,
  next: MerchantReviewReply,
): MerchantReviewReply[] {
  const list = parseMerchantReviewReplies(existing, fallbackText, fallbackAt);
  if (list.length >= MERCHANT_REVIEW_REPLY_CAP) {
    throw new Error("REPLY_CAP");
  }
  return [...list, next];
}

export function repliesApiFields(
  responses: unknown,
  fallbackText?: string | null,
  fallbackAt?: string | Date | null,
): {
  replies: MerchantReviewReply[];
  replyText: string | null;
  repliedAt: string | null;
} {
  const replies = parseMerchantReviewReplies(responses, fallbackText, fallbackAt);
  const last = replies[replies.length - 1];
  return {
    replies,
    replyText: last?.text ?? null,
    repliedAt: last?.at ?? (fallbackAt != null ? toIso(fallbackAt) : null),
  };
}

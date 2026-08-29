/**
 * Ticket attachments are stored in Supabase as either:
 * - R2 key (e.g. "tickets/attachments/123/file.jpeg") – preferred; no expiry.
 * - Full R2 URL (legacy) – proxy extracts key from pathname.
 * Always use this helper for img src or link href so images load via proxy (server-side auth, no signed-URL expiry).
 */

/**
 * Returns a URL that will load the attachment via our proxy (so private R2 works and there is no expiry).
 * Use for img src or link href when displaying ticket attachments.
 */
export function getTicketAttachmentViewUrl(
  rawUrlOrKey: string | null | undefined,
): string {
  if (!rawUrlOrKey || typeof rawUrlOrKey !== "string") return "";
  const s = rawUrlOrKey.trim();
  if (!s) return "";
  // Already a partnersite proxy URL
  if (s.startsWith("/api/attachments/proxy")) return s;
  // Backend/mobile stores `/v1/attachments/proxy?key=...` — same query, partnersite path.
  if (s.startsWith("/v1/attachments/proxy")) {
    return `/api/attachments/proxy${s.slice("/v1/attachments/proxy".length)}`;
  }
  try {
    const u = /^https?:\/\//i.test(s) ? new URL(s) : new URL(s, "http://local.invalid");
    const key = u.searchParams.get("key");
    if (key) {
      let decoded = key;
      try {
        decoded = decodeURIComponent(key);
      } catch {
        /* keep */
      }
      return `/api/attachments/proxy?key=${encodeURIComponent(decoded)}`;
    }
  } catch {
    /* fall through */
  }
  // Stored as R2 key (no scheme) → use proxy by key
  if (!s.startsWith("http://") && !s.startsWith("https://")) {
    return `/api/attachments/proxy?key=${encodeURIComponent(s)}`;
  }
  // Stored as full URL (legacy) → use proxy by url so key is extracted server-side
  return `/api/attachments/proxy?url=${encodeURIComponent(s)}`;
}

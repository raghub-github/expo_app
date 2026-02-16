/**
 * Use proxy URL for ticket attachment images when the bucket is private (R2 returns Authorization).
 * Set NEXT_PUBLIC_R2_PUBLIC_BASE_URL in .env to the same value as R2_PUBLIC_BASE_URL so the
 * client can detect our R2 URLs and use the proxy.
 */
const R2_BASE = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "") : "";

/**
 * Returns a URL that will load the attachment (proxy URL for our R2, otherwise the raw URL).
 * Use this for img src or link href when displaying ticket attachments.
 */
export function getTicketAttachmentViewUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const url = rawUrl.trim();
  if (!url) return "";
  if (R2_BASE && (url.startsWith(R2_BASE + "/") || url === R2_BASE)) {
    return `/api/attachments/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

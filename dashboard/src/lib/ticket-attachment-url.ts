/**
 * For ticket attachment URLs that point to a private R2 bucket (merchant portal uploads),
 * use the merchant app's proxy so images load. Set in .env:
 * - NEXT_PUBLIC_MERCHANT_ATTACHMENT_PROXY = merchant app origin (e.g. https://merchant.example.com)
 * - NEXT_PUBLIC_MERCHANT_R2_BASE_URL = same as merchant's R2_PUBLIC_BASE_URL (e.g. https://pub-xxx.r2.dev)
 */
const PROXY_ORIGIN = process.env.NEXT_PUBLIC_MERCHANT_ATTACHMENT_PROXY?.replace(/\/$/, "") ?? "";
const R2_BASE = process.env.NEXT_PUBLIC_MERCHANT_R2_BASE_URL?.replace(/\/$/, "") ?? "";

export function getTicketAttachmentViewUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const url = rawUrl.trim();
  if (!url) return "";
  if (PROXY_ORIGIN && R2_BASE && (url.startsWith(R2_BASE + "/") || url === R2_BASE)) {
    return `${PROXY_ORIGIN}/api/attachments/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

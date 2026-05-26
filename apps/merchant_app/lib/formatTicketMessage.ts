/** Decode common HTML entities for ticket message display. */
function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : _;
    });
}

/**
 * Convert ticket message HTML (e.g. dashboard/agent replies with `<br>`) into readable plain text.
 */
export function formatTicketMessageForDisplay(raw: unknown): string {
  let text = String(raw ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) return "";

  text = text.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
  text = text.replace(/<(p|div|li|tr|h[1-6])[^>]*>/gi, "\n");
  text = text.replace(/<\/?[^>]+>/g, "");
  text = decodeHtmlEntities(text);
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

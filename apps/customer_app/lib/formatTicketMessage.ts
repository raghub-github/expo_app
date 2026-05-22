/**
 * Convert agent/dashboard HTML replies into readable chat text (no raw tags).
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
};

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(text) || /&(?:nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i.test(text);
}

/** Agent rich-text (div/br/nbsp) → plain text with line breaks for RN chat bubbles. */
export function formatTicketMessageText(raw: unknown): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";

  if (!looksLikeHtml(text)) {
    return decodeHtmlEntities(text.replace(/\r\n/g, "\n"));
  }

  text = text
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*(p|div|li|tr|h[1-6])(\s[^>]*)?>/gi, "");

  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  return text;
}

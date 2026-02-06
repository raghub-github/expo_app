/**
 * Utility function to merge class names
 * Similar to clsx but simpler
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Parse JSON from API response text without throwing SyntaxError on invalid/trailing content.
 * Trims and strips BOM; if full parse fails, tries to parse the first complete JSON object.
 * Throws a controlled Error so callers can handle instead of unhandledRejection.
 */
export function safeParseJson<T = unknown>(text: string, fallbackMessage = "Invalid JSON response"): T {
  const raw = typeof text === "string" ? text.trim().replace(/^\uFEFF/, "") : "";
  if (!raw) {
    throw new Error(fallbackMessage);
  }
  if (raw[0] !== "{" && raw[0] !== "[") {
    throw new Error(`${fallbackMessage}: expected JSON object or array`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    if (raw[0] === "{") {
      const end = findMatchingBrace(raw, 0, "{", "}");
      if (end !== -1) {
        try {
          return JSON.parse(raw.slice(0, end + 1)) as T;
        } catch {
          // fall through to throw
        }
      }
    }
    throw new Error(
      e instanceof SyntaxError
        ? `${fallbackMessage}: ${e.message}`
        : fallbackMessage
    );
  }
}

function findMatchingBrace(str: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === open) depth++;
    else if (str[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

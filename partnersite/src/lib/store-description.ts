/** Store description limits & sanitization (plain text; emoji / newlines allowed). */

export const STORE_DESCRIPTION_MIN = 20;
export const STORE_DESCRIPTION_MAX = 500;

/**
 * Strip HTML/script for XSS safety. Keeps newlines, emoji, and most special characters.
 */
export function sanitizeStoreDescription(raw: string): string {
  let s = String(raw ?? "");
  // Remove script blocks first
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  // Strip remaining HTML tags
  s = s.replace(/<\/?[^>]+>/g, "");
  // Neutralize leftover angle brackets that could form tags later
  s = s.replace(/[<>]/g, "");
  // Null bytes / other control chars except \n \r \t
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return s;
}

/** Unicode-aware length (counts code points; works better with emoji than String.length). */
export function storeDescriptionLength(value: string): number {
  return Array.from(value).length;
}

/** Clamp to max while typing (after sanitize). Does not trim — trim on blur/save. */
export function clampStoreDescriptionInput(raw: string): string {
  const sanitized = sanitizeStoreDescription(raw);
  const chars = Array.from(sanitized);
  if (chars.length <= STORE_DESCRIPTION_MAX) return sanitized;
  return chars.slice(0, STORE_DESCRIPTION_MAX).join("");
}

/** Trim + sanitize for persistence. */
export function normalizeStoreDescriptionForSave(raw: string): string {
  return sanitizeStoreDescription(raw).trim();
}

export function isStoreDescriptionValid(raw: string): boolean {
  const n = storeDescriptionLength(normalizeStoreDescriptionForSave(raw));
  return n >= STORE_DESCRIPTION_MIN && n <= STORE_DESCRIPTION_MAX;
}

export function storeDescriptionValidationMessage(raw: string): string | null {
  const normalized = normalizeStoreDescriptionForSave(raw);
  const n = storeDescriptionLength(normalized);
  if (n === 0) {
    return `Store description is required (${STORE_DESCRIPTION_MIN}–${STORE_DESCRIPTION_MAX} characters).`;
  }
  if (n < STORE_DESCRIPTION_MIN) {
    return `Store description must be at least ${STORE_DESCRIPTION_MIN} characters (currently ${n}).`;
  }
  if (n > STORE_DESCRIPTION_MAX) {
    return `Store description must be at most ${STORE_DESCRIPTION_MAX} characters.`;
  }
  return null;
}

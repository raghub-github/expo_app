/**
 * Super-admin / dashboard store search helpers.
 * Digits-only input is treated as the GMMC suffix (e.g. `1015` → `GMMC1015`).
 */
export function normalizeStoreSearchToken(raw: string): {
  exactPublicId: string | null;
  partialToken: string;
} {
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!trimmed) return { exactPublicId: null, partialToken: '' };

  if (/^\d+$/.test(trimmed)) {
    return { exactPublicId: `GMMC${trimmed}`, partialToken: trimmed };
  }

  if (/^GMMC\d+$/.test(trimmed)) {
    return { exactPublicId: trimmed, partialToken: trimmed };
  }

  return { exactPublicId: null, partialToken: trimmed };
}

/** Resolve user input to canonical public store_id when possible. */
export function resolveStorePublicIdInput(raw: string): string {
  const { exactPublicId, partialToken } = normalizeStoreSearchToken(raw);
  return exactPublicId ?? partialToken;
}

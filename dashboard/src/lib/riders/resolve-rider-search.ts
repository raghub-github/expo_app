/** Parse GMR1052 or numeric id from dashboard rider search without a DB round-trip. */
export function parseNumericRiderIdFromSearch(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const gmr = /^GMR(\d+)$/i.exec(trimmed);
  if (gmr) return parseInt(gmr[1], 10);
  if (/^\d{1,9}$/.test(trimmed)) return parseInt(trimmed, 10);
  return null;
}

/** Phone or partial mobile search still needs Supabase lookup. */
export function riderSearchNeedsSupabaseResolve(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return parseNumericRiderIdFromSearch(trimmed) == null;
}

function normalizeRiderSearchPhone(value: string): string {
  return value.replace(/^\+?91/, "").replace(/\D/g, "");
}

/** True when URL search already matches a rider loaded in dashboard context. */
export function riderSearchMatchesLoadedRider(
  search: string,
  rider: { id: number; mobile: string }
): boolean {
  const trimmed = search.trim();
  if (!trimmed) return false;
  const parsedId = parseNumericRiderIdFromSearch(trimmed);
  if (parsedId != null) return rider.id === parsedId;
  const needle = normalizeRiderSearchPhone(trimmed);
  if (!needle) return false;
  const mobile = normalizeRiderSearchPhone(rider.mobile);
  return mobile === needle || mobile.endsWith(needle);
}

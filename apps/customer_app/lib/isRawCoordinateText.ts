/**
 * Detect lat,lng strings that must never appear as customer-facing place names.
 * Matches forms like "29.3701, 76.9638" or "29.3701168,76.9637708".
 */
export function isRawCoordinateText(value?: string | null): boolean {
  if (!value?.trim()) return false;
  return /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(value.trim());
}

/** Drop coordinate-looking fragments from comma-separated address parts. */
export function filterCoordinateAddressParts(parts: string[]): string[] {
  return parts.filter((p) => !!p.trim() && !isRawCoordinateText(p));
}

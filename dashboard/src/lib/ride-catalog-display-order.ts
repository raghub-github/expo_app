/** Customer-facing catalog order and admin assign-catalog pills. Travel is retired. */
export const RIDE_CATALOG_DISPLAY_ORDER = [
  "bike",
  "bike-lite",
  "auto",
  "ev_auto",
  "cab-economy",
  "cab-premium",
] as const;

export const HIDDEN_RIDE_CATALOG_CODES = new Set(["travel"]);

export function sortRideCatalogRows<T extends { code: string }>(rows: T[]): T[] {
  const rank = (code: string) => {
    const i = (RIDE_CATALOG_DISPLAY_ORDER as readonly string[]).indexOf(code);
    return i < 0 ? 1000 : i;
  };
  return [...rows].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
}

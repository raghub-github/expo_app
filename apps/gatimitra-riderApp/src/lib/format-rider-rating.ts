/** Format DB average (1–5) for display; returns null when rider has no ratings yet. */
export function formatRiderRatingDisplay(avg: number | null | undefined): string | null {
  if (avg == null || !Number.isFinite(avg)) return null;
  return Math.min(5, Math.max(1, avg)).toFixed(1);
}

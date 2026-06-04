/** Normalize order_timelines.status for comparison. */
export function normalizeOrderTimelineStatus(status: string): string {
  return String(status || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rider milestones belong on the Rider details card timeline only. */
const RIDER_ONLY_ORDER_TIMELINE_STATUSES = new Set([
  "rider assigned",
  "rider at pickup",
  "delivery partner assigned",
  "searching rider",
  "reached store",
  "reached mx",
  "reached merchant",
  "rider reached pickup",
  "handed over to rider",
]);

export function isRiderOnlyOrderTimelineEntry(entry: {
  status: string;
  actorType?: string | null;
}): boolean {
  const norm = normalizeOrderTimelineStatus(entry.status);
  if (RIDER_ONLY_ORDER_TIMELINE_STATUSES.has(norm)) return true;
  if (norm === "picked up" && String(entry.actorType || "").toLowerCase() === "rider") {
    return true;
  }
  return false;
}

/** Normalize order_timelines.status for comparison. */
export function normalizeOrderTimelineStatus(status: string): string {
  return String(status || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isOrderCancellationTimelineStatus(status: string): boolean {
  const norm = normalizeOrderTimelineStatus(status);
  return norm === "cancelled" || norm === "canceled" || norm === "rejected";
}

function parseTimelineMetadata(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
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

/** Rider assignment cancel/unassign must not appear on the main order progress timeline. */
export function isRiderAssignmentCancellationTimelineEntry(entry: {
  status: string;
  statusMessage?: string | null;
  metadata?: unknown;
}): boolean {
  if (!isOrderCancellationTimelineStatus(entry.status)) return false;
  const meta = parseTimelineMetadata(entry.metadata);
  if (meta?.adminCancelled === true || meta?.riderUnassign === true) return true;
  if (meta?.rider_assignment_cancel === true || meta?.rider_assignment_only === true) {
    return true;
  }
  const msg = (entry.statusMessage ?? "").trim().toLowerCase();
  if (msg.includes("rider cancelled by agent")) return true;
  if (msg.includes("rider unassigned")) return true;
  return false;
}

function cancellationEntryScore(entry: {
  status: string;
  statusMessage?: string | null;
  metadata?: unknown;
  occurredAt?: string | Date | null;
}): number {
  let score = 0;
  const meta = parseTimelineMetadata(entry.metadata);
  if (meta?.order_cancellation === true) score += 8;
  if (meta?.rejected_reason || meta?.cancel_mode) score += 4;
  if (normalizeOrderTimelineStatus(entry.status) === "cancelled") score += 2;
  if ((entry.statusMessage ?? "").trim()) score += 1;
  if (entry.occurredAt) score += 0.001;
  return score;
}

/** Keep a single order-cancellation node on the progress timeline (handles legacy duplicates). */
export function dedupeOrderCancellationTimelineEntries<
  T extends {
    status: string;
    statusMessage?: string | null;
    metadata?: unknown;
    occurredAt?: string | Date | null;
  },
>(entries: T[]): T[] {
  const cancelIndexes = entries
    .map((entry, index) => (isOrderCancellationTimelineStatus(entry.status) ? index : -1))
    .filter((index) => index >= 0);

  if (cancelIndexes.length <= 1) return entries;

  let keepIndex = cancelIndexes[0]!;
  let bestScore = cancellationEntryScore(entries[keepIndex]!);

  for (let i = 1; i < cancelIndexes.length; i += 1) {
    const idx = cancelIndexes[i]!;
    const score = cancellationEntryScore(entries[idx]!);
    if (score > bestScore) {
      bestScore = score;
      keepIndex = idx;
    }
  }

  return entries.filter(
    (entry, index) =>
      !isOrderCancellationTimelineStatus(entry.status) || index === keepIndex
  );
}

export function filterOrderProgressTimelineEntries<
  T extends {
    status: string;
    actorType?: string | null;
    statusMessage?: string | null;
    metadata?: unknown;
    occurredAt?: string | Date | null;
  },
>(entries: T[]): T[] {
  const withoutRiderMilestones = entries.filter((entry) => !isRiderOnlyOrderTimelineEntry(entry));
  const withoutRiderAssignmentCancel = withoutRiderMilestones.filter(
    (entry) => !isRiderAssignmentCancellationTimelineEntry(entry)
  );
  return dedupeOrderCancellationTimelineEntries(withoutRiderAssignmentCancel);
}

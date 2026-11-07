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
  if (meta?.order_cancellation === true) return false;
  const msg = (entry.statusMessage ?? "").trim().toLowerCase();
  if (msg.includes("rider cancelled by agent")) return true;
  if (msg.includes("rider unassigned")) return true;
  if (msg.includes("rider cancelled")) return true;
  if (msg.includes("assignment cancelled") || msg.includes("assignment canceled")) return true;
  if (msg.includes("reassigned") || msg.includes("re-assign")) return true;
  if (msg.includes("captain cancelled") || msg.includes("captain canceled")) return true;
  if (msg.includes("offer expired") || msg.includes("offer timeout")) return true;
  if (msg.includes("searching again") || msg.includes("search restarted")) return true;
  return false;
}

/** Progress after a mid-trip cancel means the order continued (rider churn), not order cancel. */
const POST_CANCEL_PROGRESS_STATUSES = new Set([
  "searching rider",
  "rider assigned",
  "delivery partner assigned",
  "rider at pickup",
  "rider reached pickup",
  "reached store",
  "reached mx",
  "reached merchant",
  "handed over to rider",
  "picked up",
  "out for delivery",
  "on the way",
  "in transit",
  "ride in progress",
  "arrived at drop",
  "near drop",
  "delivered",
  "completed",
]);

function isPostCancelProgressStatus(status: string): boolean {
  return POST_CANCEL_PROGRESS_STATUSES.has(normalizeOrderTimelineStatus(status));
}

function timelineOccurredMs(value: string | Date | null | undefined): number {
  if (value == null || value === "") return 0;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Drop CANCELLED nodes that were superseded by later live progress.
 * Order-level cancel is terminal — if Rider Assigned / At Pickup / … appears after
 * CANCELLED, that cancel was rider churn and must not show on a live order bar.
 */
export function dropSupersededOrderCancellationEntries<
  T extends {
    status: string;
    occurredAt?: string | Date | null;
  },
>(entries: T[]): T[] {
  const cancelIndexes = entries
    .map((entry, index) => (isOrderCancellationTimelineStatus(entry.status) ? index : -1))
    .filter((index) => index >= 0);
  if (cancelIndexes.length === 0) return entries;

  const superseded = new Set<number>();
  for (const cancelIdx of cancelIndexes) {
    const cancelAt = timelineOccurredMs(entries[cancelIdx]?.occurredAt);
    const hasLaterProgress = entries.some((entry, index) => {
      if (index === cancelIdx) return false;
      if (!isPostCancelProgressStatus(entry.status)) return false;
      const at = timelineOccurredMs(entry.occurredAt);
      // Prefer time; if either stamp missing, fall back to array order.
      if (cancelAt > 0 && at > 0) return at > cancelAt;
      return index > cancelIdx;
    });
    if (hasLaterProgress) superseded.add(cancelIdx);
  }
  if (superseded.size === 0) return entries;
  return entries.filter((_, index) => !superseded.has(index));
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
>(
  entries: T[],
  options?: {
    /**
     * Parcel / person-ride progress is rider-driven (no merchant Accepted/Ready/…).
     * Keep rider milestone statuses on the main order progress bar for those types.
     */
    keepRiderMilestones?: boolean;
  }
): T[] {
  const withoutRiderMilestones = options?.keepRiderMilestones
    ? entries
    : entries.filter((entry) => !isRiderOnlyOrderTimelineEntry(entry));
  const withoutRiderAssignmentCancel = withoutRiderMilestones.filter(
    (entry) => !isRiderAssignmentCancellationTimelineEntry(entry)
  );
  const withoutSupersededCancel = dropSupersededOrderCancellationEntries(
    withoutRiderAssignmentCancel
  );
  return dedupeOrderCancellationTimelineEntries(withoutSupersededCancel);
}

/** True when the order progress timeline shows an order-level cancellation (not rider unassign). */
export function hasOrderCancellationOnProgressTimeline(
  entries:
    | Array<{
        status: string;
        actorType?: string | null;
        statusMessage?: string | null;
        metadata?: unknown;
        occurredAt?: string | Date | null;
      }>
    | null
    | undefined
): boolean {
  if (!entries?.length) return false;
  return filterOrderProgressTimelineEntries(entries).some((entry) =>
    isOrderCancellationTimelineStatus(entry.status)
  );
}

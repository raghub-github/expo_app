/** Timeline row used to locate the first stage at/after First ETA breach. */
export type EtaBreachTimelineEntry = {
  id?: number;
  occurredAt?: string | Date | null;
  placeholder?: boolean;
};

/**
 * Index of the first timeline stage where ETA is considered breached.
 * Stages that completed at or before First ETA stay green; breach starts at the
 * first milestone strictly after First ETA, or the next slot when ETA passed
 * with no later milestone yet.
 */
export function resolveEtaBreachTimelineIndex(
  entries: EtaBreachTimelineEntry[],
  firstEtaAt: Date
): number {
  const etaMs = firstEtaAt.getTime();
  if (!Number.isFinite(etaMs) || entries.length === 0) return -1;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.placeholder) continue;
    const atMs = toTimeMs(e.occurredAt);
    if (atMs != null && atMs > etaMs) return i;
  }

  let lastCompletedBeforeOrAtEta = -1;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.placeholder) continue;
    const atMs = toTimeMs(e.occurredAt);
    if (atMs != null && atMs <= etaMs) lastCompletedBeforeOrAtEta = i;
  }

  if (lastCompletedBeforeOrAtEta >= 0) {
    const next = lastCompletedBeforeOrAtEta + 1;
    return next < entries.length ? next : lastCompletedBeforeOrAtEta;
  }

  return -1;
}

/** order_timelines.id for the stage where breach starts (for DB persistence). */
export function resolveEtaBreachTimelineEntryId(
  entries: Array<{ id: number; occurredAt?: string | Date | null }>,
  firstEtaAt: Date
): number | null {
  const etaMs = firstEtaAt.getTime();
  if (!Number.isFinite(etaMs) || entries.length === 0) return null;

  const sorted = [...entries].sort(
    (a, b) => (toTimeMs(a.occurredAt) ?? 0) - (toTimeMs(b.occurredAt) ?? 0)
  );

  for (const e of sorted) {
    const atMs = toTimeMs(e.occurredAt);
    if (atMs != null && atMs > etaMs && e.id > 0) return e.id;
  }

  let lastBeforeOrAt: (typeof sorted)[number] | null = null;
  for (const e of sorted) {
    const atMs = toTimeMs(e.occurredAt);
    if (atMs != null && atMs <= etaMs) lastBeforeOrAt = e;
  }

  if (lastBeforeOrAt) {
    const lastMs = toTimeMs(lastBeforeOrAt.occurredAt) ?? 0;
    const next = sorted.find((e) => {
      const atMs = toTimeMs(e.occurredAt);
      return atMs != null && atMs > lastMs && e.id > 0;
    });
    if (next) return next.id;
  }

  return null;
}

function toTimeMs(value: string | Date | null | undefined): number | null {
  if (value == null || value === "") return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

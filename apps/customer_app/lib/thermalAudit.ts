/**
 * Dev-only thermal/perf breadcrumbs. Production is a no-op.
 * Never log coordinates, tokens, phone numbers, or order payloads.
 */

const lastByEvent = new Map<string, number>();

export function thermalAudit(
  event: string,
  extra?: Record<string, string | number | boolean | null | undefined>
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const now = Date.now();
  const prev = lastByEvent.get(event) ?? 0;
  if (now - prev < 2_000) return;
  lastByEvent.set(event, now);
  // eslint-disable-next-line no-console
  console.log(`[THERMAL_AUDIT] ${event}`, extra ?? {});
}

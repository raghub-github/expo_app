/**
 * Dev-only counters for thermal/battery audits.
 * Log summary from Metro: `global.__mxPerfAudit?.logSummary()`
 */
type Bucket = {
  count: number;
  lastAt: number;
};

const buckets = new Map<string, Bucket>();

export function perfAuditMark(name: string, delta = 1): void {
  if (!__DEV__) return;
  const prev = buckets.get(name) ?? { count: 0, lastAt: 0 };
  buckets.set(name, { count: prev.count + delta, lastAt: Date.now() });
}

export function perfAuditLogSummary(): void {
  if (!__DEV__) return;
  const rows = [...buckets.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, { count, lastAt }]) => ({
      name,
      count,
      lastSecAgo: Math.round((Date.now() - lastAt) / 1000),
    }));
  // eslint-disable-next-line no-console
  console.log("[mx-perf-audit]", rows);
}

declare global {
  // eslint-disable-next-line no-var
  var __mxPerfAudit: { logSummary: () => void; mark: typeof perfAuditMark } | undefined;
}

if (__DEV__) {
  global.__mxPerfAudit = {
    logSummary: perfAuditLogSummary,
    mark: perfAuditMark,
  };
}

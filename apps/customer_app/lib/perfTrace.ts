/**
 * Temporary, development-only Add-to-Cart timing instrumentation.
 * Every export is a no-op when `__DEV__` is false, so none of this ships in production.
 *
 * Usage: perfMark("tap:add:<itemKey>") at the earliest point a tap is received, then
 * perfMeasure("store:updated", "tap:add:<itemKey>") etc. at each later checkpoint.
 * Logs one line per measurement to the Metro/logcat console:
 *   [perf] tap:add:123 -> store:updated  4.2ms
 *   [perf] tap:add:123 -> row:rendered   9.8ms   (!) exceeds 100ms budget
 */

const marks = new Map<string, number>();
const BUDGET_MS = 100;

export function perfMark(label: string): void {
  if (!__DEV__) return;
  marks.set(label, performance.now());
}

export function perfMeasure(fromLabel: string, toLabel: string): number | null {
  if (!__DEV__) return null;
  const start = marks.get(fromLabel);
  if (start == null) return null;
  const duration = performance.now() - start;
  const over = duration > BUDGET_MS ? " (!) exceeds 100ms budget" : "";
  // eslint-disable-next-line no-console
  console.log(
    `[perf] ${fromLabel} -> ${toLabel}  ${duration.toFixed(1)}ms${over}`
  );
  return duration;
}

export function perfClear(label: string): void {
  if (!__DEV__) return;
  marks.delete(label);
}

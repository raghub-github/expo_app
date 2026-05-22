/**
 * In-process counters + a Prometheus-style text exporter.
 *
 * Why a hand-rolled implementation:
 *   - prom-client adds 6 MB to every service image
 *   - we don't need histograms yet — Fastify already emits per-route latency
 *     via Pino, and Loki+Grafana derive p50/p95 from that
 *   - the API is small enough to swap for prom-client later if needed
 *
 * Each service mounts this at `/metrics`. Prometheus scrapes every 15s and
 * stores the deltas. Grafana queries Prom for dashboards.
 */

type Counter = { value: number; help: string; labels?: Record<string, string> };

const counters = new Map<string, Counter>();

function key(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");
  return `${name}{${parts}}`;
}

export function incrCounter(
  name: string,
  help: string,
  delta: number = 1,
  labels?: Record<string, string>,
): void {
  const k = key(name, labels);
  const existing = counters.get(k);
  if (existing) {
    existing.value += delta;
    return;
  }
  counters.set(k, { value: delta, help, labels });
}

/**
 * Render the registered counters in Prometheus text-exposition format.
 *
 *   # HELP my_counter description
 *   # TYPE my_counter counter
 *   my_counter{label="value"} 42
 */
export function renderPrometheus(): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const [k, c] of counters) {
    const baseName = k.split("{")[0]!;
    if (!seen.has(baseName)) {
      lines.push(`# HELP ${baseName} ${c.help}`);
      lines.push(`# TYPE ${baseName} counter`);
      seen.add(baseName);
    }
    lines.push(`${k} ${c.value}`);
  }
  return lines.join("\n") + "\n";
}

/** Reset — primarily for tests; production scrapes monotonic counters. */
export function resetMetrics(): void {
  counters.clear();
}

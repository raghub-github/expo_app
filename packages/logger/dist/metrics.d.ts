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
export declare function incrCounter(name: string, help: string, delta?: number, labels?: Record<string, string>): void;
/**
 * Render the registered counters in Prometheus text-exposition format.
 *
 *   # HELP my_counter description
 *   # TYPE my_counter counter
 *   my_counter{label="value"} 42
 */
export declare function renderPrometheus(): string;
/** Reset — primarily for tests; production scrapes monotonic counters. */
export declare function resetMetrics(): void;
//# sourceMappingURL=metrics.d.ts.map
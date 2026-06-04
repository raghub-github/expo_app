/**
 * @gatimitra/logger — pino-based structured logger shared across services.
 *
 * Why one shared logger:
 *   - Same JSON shape across backend + workers + ws-gateway → log aggregators
 *     (Loki, Datadog) can group by `service` field without per-service grok.
 *   - One place to flip pretty-print, sampling, redactors.
 *
 * Usage:
 *   import { createLogger } from "@gatimitra/logger";
 *   const log = createLogger({ service: "notification-worker" });
 *   log.info({ orderId }, "push enqueued");
 *
 * Each log line carries:
 *   { service, level, time, pid, hostname, requestId?, ...payload, msg }
 */
import pino, { type Logger } from "pino";
export type CreateLoggerOptions = {
    /** Service name — appears in every log line for routing in log aggregators. */
    service: string;
    /** Override level; defaults to debug in dev, info in prod. */
    level?: pino.LevelWithSilent;
    /** Pretty-print in dev when stdout is a TTY. */
    prettyPrint?: boolean;
};
export declare function createLogger(opts: CreateLoggerOptions): Logger;
export { incrCounter, renderPrometheus, resetMetrics } from "./metrics.js";
export { initSentry } from "./sentry.js";
export type { Logger };
//# sourceMappingURL=index.d.ts.map
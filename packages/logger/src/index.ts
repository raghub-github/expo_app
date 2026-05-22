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
import pino, { type LoggerOptions, type Logger } from "pino";

export type CreateLoggerOptions = {
  /** Service name — appears in every log line for routing in log aggregators. */
  service: string;
  /** Override level; defaults to debug in dev, info in prod. */
  level?: pino.LevelWithSilent;
  /** Pretty-print in dev when stdout is a TTY. */
  prettyPrint?: boolean;
};

export function createLogger(opts: CreateLoggerOptions): Logger {
  const isProd = process.env.NODE_ENV === "production";
  const level = opts.level ?? (isProd ? "info" : "debug");
  const usePretty = !isProd && (opts.prettyPrint ?? process.stdout.isTTY);

  const config: LoggerOptions = {
    level,
    base: { service: opts.service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      // Never log obvious secrets. Add more keys as we encounter them.
      paths: [
        "password",
        "token",
        "*.password",
        "*.token",
        "*.authorization",
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-internal-token']",
        "headers.authorization",
        "headers.cookie",
      ],
      remove: true,
    },
  };

  if (usePretty) {
    try {
      // Lazy require so prod images can drop pino-pretty.
      const transport = {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
      };
      return pino({ ...config, transport });
    } catch {
      /* fall through to JSON */
    }
  }
  return pino(config);
}

export { incrCounter, renderPrometheus, resetMetrics } from "./metrics.js";
export { initSentry } from "./sentry.js";
export type { Logger };

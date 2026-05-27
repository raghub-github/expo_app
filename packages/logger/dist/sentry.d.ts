/**
 * Sentry init — lazy + env-gated so services that don't have a DSN don't pay
 * the bundle cost or risk a crash. Wire this at the TOP of each service's
 * entrypoint (before any other side-effect imports) so unhandled exceptions
 * during startup are captured.
 *
 * Usage:
 *   import { initSentry } from "@gatimitra/logger";
 *   await initSentry({ service: "backend" });
 *
 * Required env (set per-service):
 *   SENTRY_DSN          — when missing, init is a no-op
 *   SENTRY_ENVIRONMENT  — "production" / "staging" / "dev" (default: NODE_ENV)
 *   SENTRY_TRACES_RATE  — sampling rate for performance traces (default 0.05)
 *
 * Why we don't import @sentry/node at the top:
 *   - Half our services don't need it (workers can crash + restart cleanly)
 *   - The SDK is 700 KB. Lazy import keeps it out of cold-start critical path
 *     for services that opt out.
 */
export type InitSentryOptions = {
    service: string;
    release?: string;
};
export declare function initSentry(opts: InitSentryOptions): Promise<void>;
//# sourceMappingURL=sentry.d.ts.map
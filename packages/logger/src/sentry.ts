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

let initialized = false;

export async function initSentry(opts: InitSentryOptions): Promise<void> {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || !dsn.trim()) return; // opt-out by omission

  try {
    // Dynamic + un-typed import so this package compiles even when consumer
    // services don't install @sentry/node. Consumer services that want
    // Sentry add it to their own package.json.
    type SentryShape = {
      init: (cfg: Record<string, unknown>) => void;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import(/* @vite-ignore */ "@sentry/node" as any)) as unknown as SentryShape;
    mod.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      release: opts.release ?? process.env.GIT_SHA,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE ?? 0.05),
      // Default integrations include http + console — they're noisy. Keep the
      // defaults for now; we can tune as alert volume tells us what matters.
      initialScope: { tags: { service: opts.service } },
    });
    initialized = true;
    // Surface a clear log line on boot so ops can confirm Sentry is on.
    // eslint-disable-next-line no-console
    console.log(`[sentry] initialized for ${opts.service}`);
  } catch (err) {
    // Sentry isn't installed in this service's package.json → safe no-op.
    // The catch keeps boot from failing on services that opted out.
    // eslint-disable-next-line no-console
    console.warn(
      `[sentry] init skipped (${opts.service}): ${(err as Error).message}`,
    );
  }
}

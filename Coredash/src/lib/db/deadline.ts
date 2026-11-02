/**
 * Hard client-side deadline for a single database call.
 *
 * Why this is the real timeout
 * ----------------------------
 * Two separate things can make a query never come back, and neither was
 * bounded before:
 *
 *  1. The server-side `statement_timeout` Coredash asks for in the postgres.js
 *     startup packet is SILENTLY DROPPED by Supavisor, the Supabase
 *     transaction pooler we connect through on :6543. Verified against
 *     production: with `statement_timeout: 20_000` and
 *     `idle_in_transaction_session_timeout: 20_000` both set, the server still
 *     reports `2min` and `0`, and a `SELECT pg_sleep(25)` ran to completion.
 *     The intended 20s fail-fast did not exist.
 *
 *  2. postgres.js queues a query indefinitely when every `max` pool slot is
 *     busy. There is no acquire timeout. Once enough requests wedge, every
 *     later request waits forever and the container never recovers by itself.
 *
 * Both surfaced the same way: treasury.gatimitra.com/api/auth/can-login hung
 * for the full 120s nginx proxy_read_timeout and returned nginx's HTML 504, so
 * the sign-in page sat on "Completing sign-in..." forever while the browser
 * threw `Unexpected token '<'` parsing that HTML as JSON.
 *
 * A deadline fixes both: the route answers in bounded time with real JSON, and
 * cancelling hands the pool slot back instead of leaking it.
 */

export const DB_QUERY_DEADLINE_MS = Number(process.env.COREDASH_DB_TIMEOUT_MS ?? 20_000);

export class DbTimeoutError extends Error {
  readonly code = "COREDASH_DB_TIMEOUT";
  constructor(label: string, ms: number) {
    super(`[coredash:db] ${label} exceeded ${ms}ms`);
    this.name = "DbTimeoutError";
  }
}

export function isDbTimeoutError(error: unknown): boolean {
  if (error instanceof DbTimeoutError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "COREDASH_DB_TIMEOUT"
  );
}

export async function withQueryDeadline<T>(
  run: () => Promise<T>,
  label: string,
  ms: number = DB_QUERY_DEADLINE_MS
): Promise<T> {
  // A non-positive or non-finite budget means "no deadline"; never turn a
  // misconfigured env var into an instant failure for every query.
  if (!Number.isFinite(ms) || ms <= 0) return run();

  const pending = run();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DbTimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    // Release the slot. postgres.js `.cancel()` handles a query still queued as
    // well as one already in flight.
    const cancellable = pending as unknown as { cancel?: () => void };
    if (typeof cancellable?.cancel === "function") {
      try {
        cancellable.cancel();
      } catch {
        /* best effort */
      }
    }
    // Losing the race leaves `pending` rejecting with nobody awaiting it, which
    // would be an unhandled rejection and can take the process down.
    void Promise.resolve(pending).catch(() => {});
  }
}

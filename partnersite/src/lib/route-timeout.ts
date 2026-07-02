/**
 * Race a promise against a timeout. When the timeout fires, reject with a
 * distinctive error so callers can tell it apart from real business errors.
 *
 * Use for expensive fan-out reads (analytics, aggregations, Supabase JS
 * queries) where nginx's 60s gateway timeout would otherwise hang the tab
 * and stack up React Query retries. Failing fast here lets the browser move
 * on, keeps the DB connection pool healthy, and stops the retry storm at
 * the source.
 */
export class RouteTimeoutError extends Error {
  constructor(public readonly ms: number, public readonly label: string) {
    super(`route_timeout_${ms}ms:${label}`);
    this.name = "RouteTimeoutError";
  }
}

export async function withRouteTimeout<T>(
  label: string,
  ms: number,
  work: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RouteTimeoutError(ms, label)), ms);
  });
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

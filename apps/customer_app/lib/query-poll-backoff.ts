import type { Query } from "@tanstack/react-query";

function isServerBusyError(error: unknown): boolean {
  const err = error as { response?: { status?: number }; status?: number };
  const status = err?.response?.status ?? err?.status;
  return status === 503 || status === 429;
}

/** Slow polling when the API is saturated; normal interval otherwise. */
export function pollIntervalWithBackoff<TData>(
  query: Query<TData, Error, TData, readonly unknown[]>,
  normalMs: number,
  busyMs = 15_000
): number | false {
  if (query.state.error && isServerBusyError(query.state.error)) {
    return busyMs;
  }
  return normalMs;
}

export function queryRetryDelay(attempt: number): number {
  return Math.min(1_500 * 2 ** attempt, 20_000);
}

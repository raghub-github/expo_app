import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidates all rider summary queries for a given rider so that any screen
 * (riders home, penalties, pending actions) shows fresh data after mutations
 * like penalty add/revert, wallet credit approve/reject/delete, add amount, etc.
 * Call this after every rider-affecting mutation so the UI updates without refresh.
 */
export function invalidateRiderSummary(
  queryClient: QueryClient,
  riderId: number
): void {
  queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === "rider" &&
      query.queryKey[1] === "summary" &&
      query.queryKey[2] === riderId,
  });
}

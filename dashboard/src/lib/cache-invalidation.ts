import type { QueryClient } from "@tanstack/react-query";
import { logDocCache } from "@/lib/rider-document-verification-pipeline";

/**
 * Invalidates all rider-related queries after document / KYC mutations so that
 * riders home banners, onboarding desk, and detail pages refresh without a
 * manual browser reload.
 */
export function invalidateRiderSummary(
  queryClient: QueryClient,
  riderId: number
): void {
  queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === "rider" &&
      (query.queryKey[1] === "summary" || query.queryKey[1] === "details") &&
      query.queryKey[2] === riderId,
  });
  // Also match RTK / custom keys that store rider id first.
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key)) return false;
      return (
        (key[0] === "getRiderDetails" || key[0] === "riderDetails") &&
        (key[1] === riderId || key.includes(riderId))
      );
    },
  });
  logDocCache({
    event: "invalidate_client",
    riderId,
  });
}

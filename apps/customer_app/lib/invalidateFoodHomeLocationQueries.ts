import type { QueryClient } from "@tanstack/react-query";

/** Listing feeds that depend on pin/coords — skip layout/weather/search on GPS jitter. */
export function invalidateFoodHomeListingQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["merchants"] }),
    queryClient.invalidateQueries({ queryKey: ["featured-offers-home"] }),
    queryClient.invalidateQueries({ queryKey: ["geo", "services"] }),
    queryClient.invalidateQueries({ queryKey: ["stores", "nearby"] }),
    queryClient.invalidateQueries({ queryKey: ["grocery-home-layout"] }),
  ]);
}

let listingDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastListingInvalidateAt = 0;
const LISTING_DEBOUNCE_MS = 1_500;
/** Avoid hammering listing APIs when GPS ticks or tabs refocus in quick succession. */
const LISTING_MIN_INTERVAL_MS = 60_000;

/**
 * Debounced + rate-limited listing refresh for background GPS / foreground resume.
 * User-initiated address changes should call `invalidateFoodHomeLocationQueries` instead.
 */
export function debouncedInvalidateFoodHomeListingQueries(queryClient: QueryClient) {
  const schedule = () => {
    if (listingDebounceTimer) clearTimeout(listingDebounceTimer);
    listingDebounceTimer = setTimeout(() => {
      listingDebounceTimer = null;
      const now = Date.now();
      if (now - lastListingInvalidateAt < LISTING_MIN_INTERVAL_MS) return;
      lastListingInvalidateAt = now;
      void invalidateFoodHomeListingQueries(queryClient);
    }, LISTING_DEBOUNCE_MS);
  };
  schedule();
}

/** Full refresh when the user explicitly changes delivery location or saved address. */
export function invalidateFoodHomeLocationQueries(queryClient: QueryClient) {
  lastListingInvalidateAt = Date.now();
  return Promise.all([
    invalidateFoodHomeListingQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: ["active-location"] }),
    queryClient.invalidateQueries({ queryKey: ["addresses"] }),
    queryClient.invalidateQueries({ queryKey: ["food-home-layout"] }),
    queryClient.invalidateQueries({ queryKey: ["weather"] }),
    queryClient.invalidateQueries({ queryKey: ["search"] }),
    queryClient.invalidateQueries({ queryKey: ["cuisines"] }),
  ]);
}

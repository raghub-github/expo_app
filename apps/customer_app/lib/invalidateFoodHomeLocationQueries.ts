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
/** Short coalesce for a confirmed significant GPS move (not the 60s gate). */
const MOVE_INVALIDATE_DEBOUNCE_MS = 400;

/**
 * Debounced + rate-limited listing refresh for background GPS jitter / tab refocus.
 * Significant physical moves must use `invalidateFoodHomeListingQueriesAfterMove`.
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

/**
 * User physically moved (≥ customer GPS move gate). Bypass the 60s rate limit
 * so nearby stores follow Location B promptly. Still briefly debounced for burst GPS.
 */
export function invalidateFoodHomeListingQueriesAfterMove(queryClient: QueryClient) {
  if (listingDebounceTimer) clearTimeout(listingDebounceTimer);
  listingDebounceTimer = setTimeout(() => {
    listingDebounceTimer = null;
    lastListingInvalidateAt = Date.now();
    void invalidateFoodHomeListingQueries(queryClient);
  }, MOVE_INVALIDATE_DEBOUNCE_MS);
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
    queryClient.invalidateQueries({ queryKey: ["food-search"] }),
    queryClient.invalidateQueries({ queryKey: ["food-search-suggest"] }),
    queryClient.invalidateQueries({ queryKey: ["cuisines"] }),
  ]);
}

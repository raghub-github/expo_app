import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { fetchLiveOrderSupportTopics } from "@/services/ticketApi";

export const LIVE_ORDER_SUPPORT_TOPICS_KEY = ["liveOrderSupportTopics"] as const;

const STALE_MS = 30 * 60 * 1000;

/** Warm cache on app load so Live order support sheet opens instantly. */
export function usePrefetchLiveOrderSupportTopics() {
  const { token } = useAuth();
  return useQuery({
    queryKey: LIVE_ORDER_SUPPORT_TOPICS_KEY,
    queryFn: () => fetchLiveOrderSupportTopics(token!),
    enabled: !!token,
    staleTime: STALE_MS,
    gcTime: 60 * 60 * 1000,
  });
}

/** Topics for the live order support sheet (uses prefetched cache when available). */
export function useLiveOrderSupportTopics(enabled = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: LIVE_ORDER_SUPPORT_TOPICS_KEY,
    queryFn: () => fetchLiveOrderSupportTopics(token!),
    enabled: !!token && enabled,
    staleTime: STALE_MS,
    gcTime: 60 * 60 * 1000,
  });
}

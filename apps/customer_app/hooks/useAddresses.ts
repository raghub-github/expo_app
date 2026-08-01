import { useQuery, type QueryClient } from "@tanstack/react-query";
import { addressService } from "@/services/address.service";
import { useAuthStore } from "@/store/authStore";

export const ADDRESSES_QUERY_KEY = ["addresses"] as const;

const STALE_MS = 30 * 1000;
const GC_MS = 60 * 60 * 1000;

export function addressesQueryOptions() {
  return {
    queryKey: ADDRESSES_QUERY_KEY,
    queryFn: () => addressService.getAddresses(),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: 1,
  } as const;
}

export function useAddresses(options?: { enabled?: boolean }) {
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.session?.accessToken);
  const authed = hydrated && !!accessToken;
  return useQuery({
    ...addressesQueryOptions(),
    enabled: options?.enabled ?? authed,
    placeholderData: (prev) => prev,
  });
}

export function prefetchAddresses(queryClient: QueryClient) {
  const { hydrated, session } = useAuthStore.getState();
  if (!hydrated || !session?.accessToken) return Promise.resolve();
  return queryClient.prefetchQuery(addressesQueryOptions()).catch(() => undefined);
}

export const ACTIVE_LOCATION_QUERY_KEY = ["active-location"] as const;

export function activeLocationQueryOptions() {
  return {
    queryKey: ACTIVE_LOCATION_QUERY_KEY,
    queryFn: () => addressService.getActiveLocation(),
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  } as const;
}

export function useActiveLocation(options?: { enabled?: boolean }) {
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.session?.accessToken);
  const authed = hydrated && !!accessToken;
  return useQuery({
    ...activeLocationQueryOptions(),
    enabled: options?.enabled ?? authed,
    placeholderData: (prev) => prev,
  });
}

export function prefetchActiveLocation(queryClient: QueryClient) {
  const { hydrated, session } = useAuthStore.getState();
  if (!hydrated || !session?.accessToken) return Promise.resolve();
  return queryClient.prefetchQuery(activeLocationQueryOptions()).catch(() => undefined);
}

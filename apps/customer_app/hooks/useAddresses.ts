import { useQuery, type QueryClient } from "@tanstack/react-query";
import { addressService } from "@/services/address.service";
import { useAuthStore } from "@/store/authStore";
import {
  bootstrapAddressesFromSession,
  getCachedAddressesUpdatedAt,
  hydrateAddressesQuery,
  readSyncCachedAddresses,
  subscribeAddressesCachePersistence,
  writeCachedAddresses,
} from "@/lib/addressesCache";

export const ADDRESSES_QUERY_KEY = ["addresses"] as const;

/** Keep warm — Select location should rarely need a cold network round-trip. */
const STALE_MS = 10 * 60 * 1000;
const GC_MS = 60 * 60 * 1000;

type Address = import("@/services/address.service").Address;

function offlineAddressesFallback(): Address[] | undefined {
  const cached = readSyncCachedAddresses();
  if (cached && cached.length > 0) return cached;
  return bootstrapAddressesFromSession();
}

export function addressesQueryOptions() {
  return {
    queryKey: ADDRESSES_QUERY_KEY,
    queryFn: async () => {
      try {
        const rows = await addressService.getAddresses();
        void writeCachedAddresses(rows);
        return rows;
      } catch (err) {
        // Low internet / timeout: never blank the picker if we know any address.
        const fallback = offlineAddressesFallback();
        if (fallback && fallback.length > 0) {
          void writeCachedAddresses(fallback);
          return fallback;
        }
        throw err;
      }
    },
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
  } as const;
}

export function useAddresses(options?: { enabled?: boolean }) {
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.session?.accessToken);
  const authed = hydrated && !!accessToken;
  const cached = offlineAddressesFallback();
  const cachedAt = getCachedAddressesUpdatedAt();
  return useQuery({
    ...addressesQueryOptions(),
    enabled: options?.enabled ?? authed,
    ...(cached && cached.length > 0
      ? {
          initialData: cached,
          // Respect disk age — do NOT mark 1min-stale on every mount (that forced
          // duplicate 25s timeouts from home + picker + prefetch).
          initialDataUpdatedAt: cachedAt > 0 ? cachedAt : Date.now(),
        }
      : {}),
    placeholderData: (prev) => prev ?? offlineAddressesFallback(),
    networkMode: "always",
  });
}

export function prefetchAddresses(queryClient: QueryClient) {
  subscribeAddressesCachePersistence(queryClient);
  const { hydrated, session } = useAuthStore.getState();
  void hydrateAddressesQuery(queryClient);
  // Always seed bootstrap into RQ so Select location is instant even before auth.
  const bootstrap = offlineAddressesFallback();
  if (bootstrap && bootstrap.length > 0) {
    const existing = queryClient.getQueryData<Address[]>(ADDRESSES_QUERY_KEY);
    if (!existing || existing.length === 0) {
      queryClient.setQueryData(ADDRESSES_QUERY_KEY, bootstrap);
    }
  }
  if (!hydrated || !session?.accessToken) return Promise.resolve();
  // Skip network if disk cache is still within staleTime.
  const cachedAt = getCachedAddressesUpdatedAt();
  if (cachedAt > 0 && Date.now() - cachedAt < STALE_MS) {
    const existing = queryClient.getQueryData<Address[]>(ADDRESSES_QUERY_KEY);
    if (existing && existing.length > 0) return Promise.resolve();
  }
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
    networkMode: "always",
  });
}

export function prefetchActiveLocation(queryClient: QueryClient) {
  const { hydrated, session } = useAuthStore.getState();
  if (!hydrated || !session?.accessToken) return Promise.resolve();
  return queryClient.prefetchQuery(activeLocationQueryOptions()).catch(() => undefined);
}

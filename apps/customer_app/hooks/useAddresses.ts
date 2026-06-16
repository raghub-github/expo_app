import { useQuery, type QueryClient } from "@tanstack/react-query";
import { addressService } from "@/services/address.service";

export const ADDRESSES_QUERY_KEY = ["addresses"] as const;

const STALE_MS = 15 * 60 * 1000;
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

export function useAddresses() {
  return useQuery({
    ...addressesQueryOptions(),
    placeholderData: (prev) => prev,
  });
}

export function prefetchAddresses(queryClient: QueryClient) {
  return queryClient.prefetchQuery(addressesQueryOptions());
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

export function useActiveLocation() {
  return useQuery({
    ...activeLocationQueryOptions(),
    placeholderData: (prev) => prev,
  });
}

export function prefetchActiveLocation(queryClient: QueryClient) {
  return queryClient.prefetchQuery(activeLocationQueryOptions());
}

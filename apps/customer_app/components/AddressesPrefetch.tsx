import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { prefetchActiveLocation, prefetchAddresses } from "@/hooks/useAddresses";
import {
  hydrateAddressesQuery,
  subscribeAddressesCachePersistence,
} from "@/lib/addressesCache";

/** Warm address caches after login so location picker opens instantly. */
export function AddressesPrefetch() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    subscribeAddressesCachePersistence(queryClient);
    // Seed RQ from disk immediately — even before auth finishes hydrating —
    // so Select location never paints a spinner for a known list.
    void hydrateAddressesQuery(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (!hydrated || !session?.accessToken) return;
    void prefetchAddresses(queryClient);
    void prefetchActiveLocation(queryClient);
  }, [hydrated, session?.accessToken, queryClient]);

  return null;
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { prefetchActiveLocation, prefetchAddresses } from "@/hooks/useAddresses";

/** Warm address caches after login so location picker opens instantly. */
export function AddressesPrefetch() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!hydrated || !session?.accessToken) return;
    void prefetchAddresses(queryClient);
    void prefetchActiveLocation(queryClient);
  }, [hydrated, session?.accessToken, queryClient]);

  return null;
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { hydrateProfileCache, prefetchProfile } from "@/lib/profileCache";

/** Warm profile cache after login so the profile tab opens instantly. */
export function ProfilePrefetch() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!hydrated || !session) return;
    void (async () => {
      await hydrateProfileCache(queryClient);
      await prefetchProfile(queryClient);
    })();
  }, [hydrated, session, queryClient]);

  return null;
}

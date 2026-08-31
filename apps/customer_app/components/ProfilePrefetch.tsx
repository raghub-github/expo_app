import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import {
  hydrateProfileCache,
  prefetchProfile,
  PROFILE_QUERY_KEY,
  readSyncCachedProfile,
} from "@/lib/profileCache";
import { prefetchEmailAvatar } from "@/lib/emailAvatar";
import { hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import { STORAGE_KEYS } from "@/constants";

/** Warm profile cache after login so home avatar / profile tab open instantly. */
export function ProfilePrefetch() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!hydrated || !session) return;
    void (async () => {
      await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.PROFILE_CACHE]);
      const sync = readSyncCachedProfile();
      if (sync) {
        queryClient.setQueryData(PROFILE_QUERY_KEY, sync);
        prefetchEmailAvatar(sync);
      }
      await hydrateProfileCache(queryClient);
      await prefetchProfile(queryClient);
    })();
  }, [hydrated, session, queryClient]);

  return null;
}

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import {
  fetchProfileWithCache,
  getCachedProfileUpdatedAt,
  PROFILE_QUERY_KEY,
  PROFILE_QUERY_OPTIONS,
  readSyncCachedProfile,
} from "@/lib/profileCache";

/** Profile with disk/MMKV cache — shows last known data instantly, refreshes in background. */
export function useProfile() {
  const accessToken = useAuthStore((s) => s.session?.accessToken ?? null);
  const hydrated = useAuthStore((s) => s.hydrated);
  const cached = readSyncCachedProfile();
  const cachedAt = getCachedProfileUpdatedAt();
  return useQuery({
    ...PROFILE_QUERY_OPTIONS,
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfileWithCache,
    enabled: hydrated && !!accessToken,
    initialData: cached,
    initialDataUpdatedAt: cached != null ? (cachedAt && cachedAt > 0 ? cachedAt : 0) : undefined,
    placeholderData: (previous) => previous ?? cached,
    refetchOnMount: (query) => {
      if (!accessToken) return false;
      const updatedAt = query.state.dataUpdatedAt;
      if (!updatedAt) return true;
      return Date.now() - updatedAt > PROFILE_QUERY_OPTIONS.staleTime;
    },
  });
}

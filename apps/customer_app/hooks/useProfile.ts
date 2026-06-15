import { useQuery } from "@tanstack/react-query";
import {
  fetchProfileWithCache,
  PROFILE_QUERY_KEY,
  PROFILE_QUERY_OPTIONS,
} from "@/lib/profileCache";

/** Profile with disk cache — shows last known data instantly, refreshes in background. */
export function useProfile() {
  return useQuery({
    ...PROFILE_QUERY_OPTIONS,
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfileWithCache,
    placeholderData: (previous) => previous,
    refetchOnMount: (query) => {
      const updatedAt = query.state.dataUpdatedAt;
      if (!updatedAt) return true;
      return Date.now() - updatedAt > PROFILE_QUERY_OPTIONS.staleTime;
    },
  });
}

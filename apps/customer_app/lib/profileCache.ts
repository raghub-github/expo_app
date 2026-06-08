import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import { profileService, type UserProfile } from "@/services/profile.service";
import { buildEmailAvatarCandidates, prefetchEmailAvatar } from "@/lib/emailAvatar";

export const PROFILE_QUERY_KEY = ["me", "profile"] as const;

/** Keep profile warm in memory — refreshed in background after login or edits. */
export const PROFILE_STALE_MS = 5 * 60 * 1000;
export const PROFILE_GC_MS = 30 * 60 * 1000;

export const PROFILE_QUERY_OPTIONS = {
  queryKey: PROFILE_QUERY_KEY,
  staleTime: PROFILE_STALE_MS,
  gcTime: PROFILE_GC_MS,
  retry: 1,
  refetchOnWindowFocus: false,
} as const;

export async function readCachedProfile(): Promise<UserProfile | undefined> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PROFILE_CACHE);
    if (!raw) return undefined;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return undefined;
  }
}

export async function writeCachedProfile(profile: UserProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PROFILE_CACHE, JSON.stringify(profile));
  } catch {
    // Non-blocking — UI still works from React Query memory cache.
  }
}

export async function clearCachedProfile(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.PROFILE_CACHE);
  } catch {
    // ignore
  }
}

export async function fetchProfileWithCache(): Promise<UserProfile> {
  const profile = await profileService.getProfile();
  await writeCachedProfile(profile);
  prefetchEmailAvatar(profile);
  return profile;
}

export async function hydrateProfileCache(queryClient: QueryClient): Promise<UserProfile | undefined> {
  const cached = await readCachedProfile();
  if (cached) {
    queryClient.setQueryData(PROFILE_QUERY_KEY, cached);
    prefetchEmailAvatar(cached);
  }
  return cached;
}

export async function prefetchProfile(queryClient: QueryClient): Promise<void> {
  const cached = await hydrateProfileCache(queryClient);
  try {
    await queryClient.fetchQuery({
      ...PROFILE_QUERY_OPTIONS,
      queryFn: fetchProfileWithCache,
      ...(cached ? { staleTime: PROFILE_STALE_MS } : {}),
    });
  } catch {
    // Screens still show cached profile when available.
  }
}

export async function invalidateProfileCache(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
}

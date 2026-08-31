import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import type { UserProfile } from "@/services/profile.service";
import { prefetchEmailAvatar } from "@/lib/emailAvatar";
import { fastGetString, fastRemove, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";

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

type CachedProfileEntry = {
  profile: UserProfile;
  cachedAt: number;
};

let memoryEntry: CachedProfileEntry | null = null;

function parseCached(raw: string | null | undefined): CachedProfileEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as UserProfile | CachedProfileEntry;
    if (parsed && typeof parsed === "object" && "profile" in parsed && parsed.profile) {
      return parsed as CachedProfileEntry;
    }
    // Legacy: bare UserProfile JSON
    if (parsed && typeof parsed === "object" && ("full_name" in parsed || "profile_completed" in parsed)) {
      return { profile: parsed as UserProfile, cachedAt: 0 };
    }
    return null;
  } catch {
    return null;
  }
}

function hydrateMemorySync(): void {
  if (memoryEntry) return;
  memoryEntry = parseCached(fastGetString(STORAGE_KEYS.PROFILE_CACHE));
}

/** Sync read for first paint (MMKV / warm memory) — avoids blank avatar while AsyncStorage loads. */
export function readSyncCachedProfile(): UserProfile | undefined {
  hydrateMemorySync();
  return memoryEntry?.profile;
}

export function getCachedProfileUpdatedAt(): number | undefined {
  hydrateMemorySync();
  return memoryEntry?.cachedAt;
}

export async function readCachedProfile(): Promise<UserProfile | undefined> {
  const sync = readSyncCachedProfile();
  if (sync) return sync;
  try {
    await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.PROFILE_CACHE]);
    memoryEntry = parseCached(fastGetString(STORAGE_KEYS.PROFILE_CACHE));
    if (memoryEntry?.profile) return memoryEntry.profile;
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PROFILE_CACHE);
    memoryEntry = parseCached(raw);
    return memoryEntry?.profile;
  } catch {
    return undefined;
  }
}

export async function writeCachedProfile(profile: UserProfile): Promise<void> {
  memoryEntry = { profile, cachedAt: Date.now() };
  const payload = JSON.stringify(memoryEntry);
  try {
    fastSetString(STORAGE_KEYS.PROFILE_CACHE, payload);
  } catch {
    // Non-blocking
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PROFILE_CACHE, payload);
  } catch {
    // Non-blocking — UI still works from React Query memory cache.
  }
}

export async function clearCachedProfile(): Promise<void> {
  memoryEntry = null;
  try {
    fastRemove(STORAGE_KEYS.PROFILE_CACHE);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.PROFILE_CACHE);
  } catch {
    // ignore
  }
}

export async function fetchProfileWithCache(): Promise<UserProfile> {
  const { profileService } = await import("@/services/profile.service");
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import type { FoodHomeLayoutKey } from "@/lib/foodHomeLayout";
import {
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  parseGridFirstSubscriptionRowBgColor,
  parseGridFirstSubscriptionRowEnabled,
  parseGridFirstUnder250Enabled,
  parseGridFirstUnder250ImageUrl,
  parseGridFirstUnder250MaxPrice,
  parseGridFirstUnder250Title,
} from "@/lib/foodHomeLayout";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import {
  getFoodHomeLayout,
  type FoodHomeLayoutResult,
} from "@/services/foodHomeLayout.service";
import { prefetchGridFirstHeroMedia } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { applyGridFirstImmersiveChrome } from "@/lib/gridFirstImmersiveChrome";
import type { ReverseGeocodeResult } from "@/services/location.service";

export const FOOD_HOME_LAYOUT_STALE_MS = 5 * 60 * 1000;
export const FOOD_HOME_LAYOUT_GC_MS = 30 * 60 * 1000;

type GeoHints = ReturnType<typeof extractCustomerGeoHints>;

type CachedFoodHomeLayoutEntry = FoodHomeLayoutResult & { cachedAt: number };

type FoodHomeLayoutCacheBlob = Record<string, CachedFoodHomeLayoutEntry>;

const prefetchInFlight = new Map<string, Promise<void>>();

const memoryByKey = new Map<string, CachedFoodHomeLayoutEntry>();

function normalizeStateKey(state: string): string {
  return state.trim().toLowerCase();
}

function cacheKeysForHints(hints: GeoHints, result?: FoodHomeLayoutResult): string[] {
  const keys: string[] = [];
  const state = hints.state?.trim() || result?.stateName?.trim();
  if (state) keys.push(`state:${normalizeStateKey(state)}`);
  if (hints.pincode) keys.push(`pincode:${hints.pincode.trim()}`);
  if (result?.stateId) keys.push(`stateId:${result.stateId}`);
  return keys;
}

function readMemoryEntry(hints: GeoHints): CachedFoodHomeLayoutEntry | undefined {
  for (const key of cacheKeysForHints(hints)) {
    const hit = memoryByKey.get(key);
    if (hit) return hit;
  }
  return undefined;
}

async function readPersistedBlob(): Promise<FoodHomeLayoutCacheBlob> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.FOOD_HOME_LAYOUT_CACHE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FoodHomeLayoutCacheBlob;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writePersistedBlob(blob: FoodHomeLayoutCacheBlob): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.FOOD_HOME_LAYOUT_CACHE, JSON.stringify(blob));
  } catch {
    // Non-blocking — in-memory + React Query still work.
  }
}

export function buildFoodHomeLayoutQueryKey(hints: GeoHints) {
  return ["food-home-layout", hints.pincode, hints.state, hints.lat, hints.lng] as const;
}

function normalizeCachedFoodHomeLayout(entry: CachedFoodHomeLayoutEntry): FoodHomeLayoutResult {
  return {
    layoutKey: entry.layoutKey,
    stateId: entry.stateId,
    stateName: entry.stateName,
    gridFirstHeroMedia: entry.gridFirstHeroMedia ?? [],
    gridFirstSubscriptionRowEnabled: parseGridFirstSubscriptionRowEnabled(
      entry.gridFirstSubscriptionRowEnabled
    ),
    gridFirstSubscriptionRowText:
      entry.gridFirstSubscriptionRowText ?? DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text,
    gridFirstSubscriptionRowBgColor: parseGridFirstSubscriptionRowBgColor(
      entry.gridFirstSubscriptionRowBgColor
    ),
    gridFirstUnder250Enabled: parseGridFirstUnder250Enabled(entry.gridFirstUnder250Enabled),
    gridFirstUnder250MaxPrice: parseGridFirstUnder250MaxPrice(entry.gridFirstUnder250MaxPrice),
    gridFirstUnder250Title: parseGridFirstUnder250Title(
      entry.gridFirstUnder250Title,
      DEFAULT_GRID_FIRST_UNDER_250.title
    ),
    gridFirstUnder250FilterLabel: parseGridFirstUnder250Title(
      entry.gridFirstUnder250FilterLabel,
      DEFAULT_GRID_FIRST_UNDER_250.filterLabel
    ),
    gridFirstUnder250TabImageUrl: parseGridFirstUnder250ImageUrl(entry.gridFirstUnder250TabImageUrl),
    gridFirstUnder250HeroImageUrl: parseGridFirstUnder250ImageUrl(entry.gridFirstUnder250HeroImageUrl),
  };
}

export async function readCachedFoodHomeLayout(
  hints: GeoHints
): Promise<FoodHomeLayoutResult | undefined> {
  const memoryHit = readMemoryEntry(hints);
  if (memoryHit) {
    return normalizeCachedFoodHomeLayout(memoryHit);
  }

  const blob = await readPersistedBlob();
  for (const key of cacheKeysForHints(hints)) {
    const hit = blob[key];
    if (hit?.layoutKey) {
      memoryByKey.set(key, hit);
      return normalizeCachedFoodHomeLayout(hit);
    }
  }
  return undefined;
}

/** Warm layout + hero media from disk before first home paint. */
export async function hydrateFoodHomeLayoutMemoryFromStorage(): Promise<void> {
  const blob = await readPersistedBlob();
  for (const [key, entry] of Object.entries(blob)) {
    if (!entry?.layoutKey) continue;
    memoryByKey.set(key, entry);
    prefetchGridFirstHeroMedia(entry.gridFirstHeroMedia);
    prefetchMealsUnder250HeroMedia(entry);
    if (entry.layoutKey === "grid_first") applyGridFirstImmersiveChrome(true);
  }
}

void hydrateFoodHomeLayoutMemoryFromStorage();

export async function writeCachedFoodHomeLayout(
  hints: GeoHints,
  result: FoodHomeLayoutResult
): Promise<void> {
  const entry: CachedFoodHomeLayoutEntry = { ...result, cachedAt: Date.now() };
  const keys = cacheKeysForHints(hints, result);
  for (const key of keys) {
    memoryByKey.set(key, entry);
  }

  const blob = await readPersistedBlob();
  for (const key of keys) {
    blob[key] = entry;
  }
  await writePersistedBlob(blob);
}

export async function fetchFoodHomeLayoutWithCache(
  hints: GeoHints
): Promise<FoodHomeLayoutResult> {
  const result = await getFoodHomeLayout({
    ...(hints.pincode ? { pincode: hints.pincode } : {}),
    ...(hints.state ? { state: hints.state } : {}),
    ...(hints.lat != null && hints.lng != null ? { lat: hints.lat, lng: hints.lng } : {}),
  });
  prefetchGridFirstHeroMedia(result.gridFirstHeroMedia);
  prefetchMealsUnder250HeroMedia(result);
  if (result.layoutKey === "grid_first") applyGridFirstImmersiveChrome(true);
  await writeCachedFoodHomeLayout(hints, result);
  return result;
}

export async function hydrateFoodHomeLayoutForHints(
  queryClient: QueryClient,
  hints: GeoHints
): Promise<FoodHomeLayoutResult | undefined> {
  const queryKey = buildFoodHomeLayoutQueryKey(hints);
  const existing = queryClient.getQueryData<FoodHomeLayoutResult>(queryKey);
  if (existing?.layoutKey) return existing;

  const cached = await readCachedFoodHomeLayout(hints);
  if (cached?.layoutKey) {
    prefetchGridFirstHeroMedia(cached.gridFirstHeroMedia);
    prefetchMealsUnder250HeroMedia(cached);
    if (cached.layoutKey === "grid_first") applyGridFirstImmersiveChrome(true);
    queryClient.setQueryData(queryKey, cached);
  }
  return cached;
}

export async function prefetchFoodHomeLayout(
  queryClient: QueryClient,
  address: ReverseGeocodeResult | null | undefined,
  coords?: { latitude: number; longitude: number } | null
): Promise<void> {
  const hints = extractCustomerGeoHints(address, coords);
  const canQuery = !!(hints.pincode || hints.state || (hints.lat != null && hints.lng != null));
  if (!canQuery) return;

  const queryKey = buildFoodHomeLayoutQueryKey(hints);
  const key = JSON.stringify(queryKey);
  const existing = queryClient.getQueryData<FoodHomeLayoutResult>(queryKey);
  const queryState = queryClient.getQueryState({ queryKey });
  const isFresh =
    existing?.layoutKey &&
    queryState?.dataUpdatedAt != null &&
    Date.now() - queryState.dataUpdatedAt < FOOD_HOME_LAYOUT_STALE_MS;
  if (isFresh) return;

  const inflight = prefetchInFlight.get(key);
  if (inflight) {
    await inflight;
    return;
  }

  const run = (async () => {
    await hydrateFoodHomeLayoutForHints(queryClient, hints);
    await queryClient.prefetchQuery({
      queryKey,
      queryFn: () => fetchFoodHomeLayoutWithCache(hints),
      staleTime: FOOD_HOME_LAYOUT_STALE_MS,
      gcTime: FOOD_HOME_LAYOUT_GC_MS,
      retry: 1,
    });
  })();

  prefetchInFlight.set(key, run);
  try {
    await run;
  } finally {
    prefetchInFlight.delete(key);
  }
}

export function getSyncFoodHomeLayoutFromQueryClient(
  queryClient: QueryClient,
  hints: GeoHints
): FoodHomeLayoutResult | undefined {
  const fromQuery = queryClient.getQueryData<FoodHomeLayoutResult>(buildFoodHomeLayoutQueryKey(hints));
  if (fromQuery?.layoutKey) return fromQuery;
  const fromMemory = readMemoryEntry(hints);
  if (!fromMemory?.layoutKey) return undefined;
  return normalizeCachedFoodHomeLayout(fromMemory);
}

export type { FoodHomeLayoutKey };

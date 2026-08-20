import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "@/constants";
import type { MerchantSummary } from "@/services/merchant.service";

export const RECENTLY_VIEWED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STORES = 12;

export type RecentlyViewedStore = {
  id: string;
  name: string;
  displayImage?: string | null;
  banner_url?: string | null;
  distanceKm?: number;
  cuisines?: string[];
  avgRating?: number | null;
  offerText?: string | null;
  isPureVeg?: boolean;
  liveStatus?: string | null;
  isOpen?: boolean;
  nextOpenAt?: string | number | null;
  nextCloseAt?: string | number | null;
  visitedAt: number;
};

function prune(list: RecentlyViewedStore[]): RecentlyViewedStore[] {
  const cutoff = Date.now() - RECENTLY_VIEWED_TTL_MS;
  const seen = new Set<string>();
  const out: RecentlyViewedStore[] = [];
  for (const row of list) {
    if (!row?.id || row.visitedAt < cutoff) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out.sort((a, b) => b.visitedAt - a.visitedAt).slice(0, MAX_STORES);
}

async function readRaw(): Promise<RecentlyViewedStore[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.RECENTLY_VIEWED_STORES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentlyViewedStore[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function readRecentlyViewedStores(): Promise<RecentlyViewedStore[]> {
  const pruned = prune(await readRaw());
  void AsyncStorage.setItem(STORAGE_KEYS.RECENTLY_VIEWED_STORES, JSON.stringify(pruned)).catch(
    () => undefined
  );
  return pruned;
}

export function snapshotRecentlyViewedStore(merchant: MerchantSummary): RecentlyViewedStore {
  return {
    id: merchant.id,
    name: merchant.name,
    displayImage: merchant.displayImage ?? null,
    banner_url: merchant.banner_url ?? null,
    distanceKm: merchant.distanceKm,
    cuisines: merchant.cuisines,
    avgRating: merchant.avgRating ?? null,
    offerText: merchant.offerText ?? null,
    isPureVeg: merchant.isPureVeg === true,
    liveStatus: merchant.liveStatus ?? null,
    isOpen: merchant.isOpen,
    nextOpenAt: merchant.nextOpenAt ?? null,
    nextCloseAt: merchant.nextCloseAt ?? null,
    visitedAt: Date.now(),
  };
}

export async function recordRecentlyViewedStore(merchant: MerchantSummary): Promise<void> {
  if (!merchant?.id) return;
  const next = prune([snapshotRecentlyViewedStore(merchant), ...(await readRaw())]);
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.RECENTLY_VIEWED_STORES, JSON.stringify(next));
  } catch {
    // Non-blocking
  }
}

export function recentlyViewedToSummary(row: RecentlyViewedStore): MerchantSummary {
  return {
    id: row.id,
    name: row.name,
    displayImage: row.displayImage,
    banner_url: row.banner_url,
    distanceKm: row.distanceKm,
    cuisines: row.cuisines,
    avgRating: row.avgRating,
    offerText: row.offerText,
    isPureVeg: row.isPureVeg === true,
    liveStatus: row.liveStatus,
    isOpen: row.isOpen,
    nextOpenAt: row.nextOpenAt,
    nextCloseAt: row.nextCloseAt,
  };
}

/** Prefer the live nearby-list merchant so discovery uses the same status engine as grid/classic. */
export function recentlyViewedToLiveSummary(
  row: RecentlyViewedStore,
  live: MerchantSummary | undefined
): MerchantSummary {
  if (live) return live;
  const snap = recentlyViewedToSummary(row);
  return {
    ...snap,
    liveStatus: undefined,
    isOpen: undefined,
  };
}

/**
 * Favorite / hearted locations — shared across food, ride, and parcel search.
 * Persisted locally (no DB migration). Synced into recent locations when toggled on.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import { useRecentLocationStore } from "@/store/recentLocationStore";

const STORAGE_KEY = "gm.favoriteLocations.v1";
const MAX_FAVORITES = 40;

export type FavoriteLocation = {
  latitude: number;
  longitude: number;
  primary: string;
  fullAddress?: string;
  savedAt: number;
};

function roundCoord(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** ~11m grid — stable across reverse-geocode label changes for the same pin. */
function coordKey(lat: number, lng: number): string {
  return `${roundCoord(lat, 4)},${roundCoord(lng, 4)}`;
}

function legacyFavKey(lat: number, lng: number, primary: string): string {
  return `${roundCoord(lat, 3)},${roundCoord(lng, 3)},${(primary ?? "").slice(0, 40).toLowerCase()}`;
}

function isSameFavorite(
  item: FavoriteLocation,
  lat: number,
  lng: number,
  primary?: string
): boolean {
  if (coordKey(item.latitude, item.longitude) === coordKey(lat, lng)) return true;
  if (primary == null || primary.length === 0) return false;
  return legacyFavKey(item.latitude, item.longitude, item.primary) === legacyFavKey(lat, lng, primary);
}

export function favoriteLocationKey(lat: number, lng: number, primary: string): string {
  return coordKey(lat, lng);
}

type FavoriteLocationsState = {
  items: FavoriteLocation[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  isFavorite: (lat: number, lng: number, primary?: string) => boolean;
  toggleFavorite: (place: Omit<FavoriteLocation, "savedAt">) => boolean;
  removeFavorite: (lat: number, lng: number, primary?: string) => void;
};

function persist(items: FavoriteLocation[]) {
  const payload = JSON.stringify({ items });
  fastSetString(STORAGE_KEY, payload);
}

function parseItems(raw: string | null | undefined): FavoriteLocation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { items?: FavoriteLocation[] };
    return Array.isArray(parsed.items) ? parsed.items.slice(0, MAX_FAVORITES) : [];
  } catch {
    return [];
  }
}

export const useFavoriteLocationsStore = create<FavoriteLocationsState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      await hydrateFastKvFromAsyncStorage([STORAGE_KEY]);
      let raw = fastGetString(STORAGE_KEY);
      if (!raw) {
        raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) fastSetString(STORAGE_KEY, raw);
      }
      set({ items: parseItems(raw), hydrated: true });
      return;
    } catch {
      /* fall through */
    }
    set({ hydrated: true });
  },

  isFavorite: (lat, lng, primary) => {
    return get().items.some((item) => isSameFavorite(item, lat, lng, primary));
  },

  toggleFavorite: (place) => {
    const existing = get().items;
    const idx = existing.findIndex((item) =>
      isSameFavorite(item, place.latitude, place.longitude, place.primary)
    );
    if (idx >= 0) {
      const next = existing.filter((_, i) => i !== idx);
      set({ items: next });
      persist(next);
      return false;
    }
    const item: FavoriteLocation = { ...place, savedAt: Date.now() };
    const next = [item, ...existing].slice(0, MAX_FAVORITES);
    set({ items: next });
    persist(next);
    useRecentLocationStore.getState().addRecentLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      primary: place.primary,
      fullAddress: place.fullAddress,
      kind: "general",
    });
    return true;
  },

  removeFavorite: (lat, lng, primary) => {
    const next = get().items.filter((item) => !isSameFavorite(item, lat, lng, primary));
    set({ items: next });
    persist(next);
  },
}));

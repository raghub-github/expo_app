/**
 * Favorite / hearted locations — shared across food, ride, and parcel search.
 * Persisted locally (no DB migration). Synced into recent locations when toggled on.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

function favKey(lat: number, lng: number, primary: string): string {
  const rlat = Math.round(lat * 1000) / 1000;
  const rlng = Math.round(lng * 1000) / 1000;
  return `${rlat},${rlng},${(primary ?? "").slice(0, 40).toLowerCase()}`;
}

export function favoriteLocationKey(
  lat: number,
  lng: number,
  primary: string
): string {
  return favKey(lat, lng, primary);
}

type FavoriteLocationsState = {
  items: FavoriteLocation[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  isFavorite: (lat: number, lng: number, primary: string) => boolean;
  toggleFavorite: (place: Omit<FavoriteLocation, "savedAt">) => boolean;
  removeFavorite: (lat: number, lng: number, primary: string) => void;
};

async function persist(items: FavoriteLocation[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ items }));
  } catch {
    /* ignore */
  }
}

export const useFavoriteLocationsStore = create<FavoriteLocationsState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: FavoriteLocation[] };
        set({
          items: Array.isArray(parsed.items) ? parsed.items.slice(0, MAX_FAVORITES) : [],
          hydrated: true,
        });
        return;
      }
    } catch {
      /* ignore */
    }
    set({ hydrated: true });
  },

  isFavorite: (lat, lng, primary) => {
    const key = favKey(lat, lng, primary);
    return get().items.some((i) => favKey(i.latitude, i.longitude, i.primary) === key);
  },

  toggleFavorite: (place) => {
    const key = favKey(place.latitude, place.longitude, place.primary);
    const existing = get().items;
    const idx = existing.findIndex(
      (i) => favKey(i.latitude, i.longitude, i.primary) === key
    );
    if (idx >= 0) {
      const next = existing.filter((_, i) => i !== idx);
      set({ items: next });
      void persist(next);
      return false;
    }
    const item: FavoriteLocation = { ...place, savedAt: Date.now() };
    const next = [item, ...existing].slice(0, MAX_FAVORITES);
    set({ items: next });
    void persist(next);
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
    const key = favKey(lat, lng, primary);
    const next = get().items.filter(
      (i) => favKey(i.latitude, i.longitude, i.primary) !== key
    );
    set({ items: next });
    void persist(next);
  },
}));

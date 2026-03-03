/**
 * Last 20 successfully selected locations – for search ranking (user_history_boost).
 * Persisted to AsyncStorage so relevance survives app restarts.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@gatimitra/recent_locations";
const MAX_RECENT = 20;

export type RecentLocationItem = {
  latitude: number;
  longitude: number;
  primary: string;
  fullAddress?: string;
};

function locationKey(lat: number, lng: number, primary: string): string {
  const rlat = Math.round(lat * 1000) / 1000;
  const rlng = Math.round(lng * 1000) / 1000;
  return `${rlat},${rlng},${(primary ?? "").slice(0, 40)}`;
}

type RecentLocationState = {
  items: RecentLocationItem[];
  hydrated: boolean;
  addRecentLocation: (place: RecentLocationItem) => void;
  getRecentLocationKeys: () => Set<string>;
  hydrate: () => Promise<void>;
};

export const useRecentLocationStore = create<RecentLocationState>((set, get) => ({
  items: [],
  hydrated: false,

  addRecentLocation: (place) => {
    const key = locationKey(place.latitude, place.longitude, place.primary);
    set((state) => {
      const next = [
        place,
        ...state.items.filter(
          (i) => locationKey(i.latitude, i.longitude, i.primary) !== key
        ),
      ].slice(0, MAX_RECENT);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return { items: next };
    });
  },

  getRecentLocationKeys: () => {
    const { items } = get();
    return new Set(items.map((i) => locationKey(i.latitude, i.longitude, i.primary)));
  },

  hydrate: async () => {
    const { hydrated } = get();
    if (hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const items = Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
      set({ items, hydrated: true });
    } catch {
      set({ items: [], hydrated: true });
    }
  },
}));

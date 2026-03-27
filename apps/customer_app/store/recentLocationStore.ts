/**
 * Last 20 successfully selected locations – for search ranking (user_history_boost).
 * In-memory only (no persistence). Cleared on app restart.
 */

import { create } from "zustand";
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
  clearRecentLocations: () => void;
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
      return { items: next };
    });
  },

  clearRecentLocations: () => {
    set({ items: [] });
  },

  getRecentLocationKeys: () => {
    const { items } = get();
    return new Set(items.map((i) => locationKey(i.latitude, i.longitude, i.primary)));
  },

  hydrate: async () => {
    const { hydrated } = get();
    if (hydrated) return;
    set({ hydrated: true });
  },
}));

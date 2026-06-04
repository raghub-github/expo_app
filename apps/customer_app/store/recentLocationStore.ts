/**
 * Recent locations + last ride pickup/drop — persisted for search browse.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MAX_RECENT = 20;
const STORAGE_KEY = "gm.recentLocations.v1";

export type RecentLocationItem = {
  latitude: number;
  longitude: number;
  primary: string;
  fullAddress?: string;
  kind?: "pickup" | "drop" | "general";
};

function locationKey(lat: number, lng: number, primary: string): string {
  const rlat = Math.round(lat * 1000) / 1000;
  const rlng = Math.round(lng * 1000) / 1000;
  return `${rlat},${rlng},${(primary ?? "").slice(0, 40)}`;
}

type RecentLocationState = {
  items: RecentLocationItem[];
  lastPickup: RecentLocationItem | null;
  lastDrop: RecentLocationItem | null;
  hydrated: boolean;
  addRecentLocation: (place: RecentLocationItem) => void;
  setLastRidePickup: (place: RecentLocationItem) => void;
  setLastRideDrop: (place: RecentLocationItem) => void;
  clearRecentLocations: () => void;
  getRecentLocationKeys: () => Set<string>;
  hydrate: () => Promise<void>;
};

async function persist(state: Pick<RecentLocationState, "items" | "lastPickup" | "lastDrop">) {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: state.items,
        lastPickup: state.lastPickup,
        lastDrop: state.lastDrop,
      })
    );
  } catch {
    // tolerated
  }
}

export const useRecentLocationStore = create<RecentLocationState>((set, get) => ({
  items: [],
  lastPickup: null,
  lastDrop: null,
  hydrated: false,

  addRecentLocation: (place) => {
    const key = locationKey(place.latitude, place.longitude, place.primary);
    set((state) => {
      const next = [
        { ...place, kind: place.kind ?? "general" },
        ...state.items.filter(
          (i) => locationKey(i.latitude, i.longitude, i.primary) !== key
        ),
      ].slice(0, MAX_RECENT);
      void persist({ items: next, lastPickup: state.lastPickup, lastDrop: state.lastDrop });
      return { items: next };
    });
  },

  setLastRidePickup: (place) => {
    set((state) => {
      const item = { ...place, kind: "pickup" as const };
      void persist({ items: state.items, lastPickup: item, lastDrop: state.lastDrop });
      return { lastPickup: item };
    });
    get().addRecentLocation({ ...place, kind: "pickup" });
  },

  setLastRideDrop: (place) => {
    set((state) => {
      const item = { ...place, kind: "drop" as const };
      void persist({ items: state.items, lastPickup: state.lastPickup, lastDrop: item });
      return { lastDrop: item };
    });
    get().addRecentLocation({ ...place, kind: "drop" });
  },

  clearRecentLocations: () => {
    set({ items: [], lastPickup: null, lastDrop: null });
    void AsyncStorage.removeItem(STORAGE_KEY);
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
      if (raw) {
        const parsed = JSON.parse(raw) as {
          items?: RecentLocationItem[];
          lastPickup?: RecentLocationItem | null;
          lastDrop?: RecentLocationItem | null;
        };
        set({
          items: Array.isArray(parsed.items) ? parsed.items.slice(0, MAX_RECENT) : [],
          lastPickup: parsed.lastPickup ?? null,
          lastDrop: parsed.lastDrop ?? null,
          hydrated: true,
        });
        return;
      }
    } catch {
      // fall through
    }
    set({ hydrated: true });
  },
}));

export { locationKey as recentLocationKey };

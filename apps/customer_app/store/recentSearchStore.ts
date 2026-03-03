/**
 * Recent search terms for the food search screen.
 * Persisted to AsyncStorage so searches survive app restarts.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@gatimitra/recent_searches";
const MAX_RECENT = 20;

type RecentSearchState = {
  items: string[];
  hydrated: boolean;
  addRecentSearch: (term: string) => void;
  removeRecentSearch: (term: string) => void;
  clearRecentSearches: () => void;
  hydrate: () => Promise<void>;
};

export const useRecentSearchStore = create<RecentSearchState>((set, get) => ({
  items: [],
  hydrated: false,

  addRecentSearch: (term) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    set((state) => {
      const next = [
        trimmed,
        ...state.items.filter((t) => t.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, MAX_RECENT);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return { items: next };
    });
  },

  removeRecentSearch: (term) => {
    set((state) => {
      const next = state.items.filter((t) => t !== term);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return { items: next };
    });
  },

  clearRecentSearches: () => {
    set({ items: [] });
    AsyncStorage.setItem(STORAGE_KEY, "[]").catch(() => {});
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

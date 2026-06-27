import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@gatimitra/dietary_preferences";

type DietaryPreferenceState = {
  vegOnly: boolean;
  hydrated: boolean;
  setVegOnly: (value: boolean) => void;
  hydrate: () => Promise<void>;
};

export const useDietaryPreferenceStore = create<DietaryPreferenceState>((set, get) => ({
  vegOnly: false,
  hydrated: false,

  setVegOnly: (value) => {
    set({ vegOnly: value });
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ vegOnly: value })
    ).catch(() => {});
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as { vegOnly?: unknown };
      set({
        vegOnly: parsed?.vegOnly === true,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
}));


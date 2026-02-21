/**
 * App language preference – persisted, user can set from Settings.
 */

import { create } from "zustand";
import { getItem, setItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";

export type AppLanguage = "en" | "hi";

export const LANGUAGE_OPTIONS: { code: AppLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
];

type LanguageState = {
  hydrated: boolean;
  language: AppLanguage;
  setLanguage: (code: AppLanguage) => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useLanguageStore = create<LanguageState>((set, get) => ({
  hydrated: false,
  language: "en",

  setLanguage: async (code) => {
    await setItem(STORAGE_KEYS.LANGUAGE, code);
    set({ language: code });
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await getItem(STORAGE_KEYS.LANGUAGE);
      const language = stored === "hi" ? "hi" : "en";
      set({ language, hydrated: true });
    } catch {
      set({ language: "en", hydrated: true });
    }
  },
}));

export function getLanguageLabel(code: AppLanguage): string {
  return LANGUAGE_OPTIONS.find((o) => o.code === code)?.label ?? "English";
}

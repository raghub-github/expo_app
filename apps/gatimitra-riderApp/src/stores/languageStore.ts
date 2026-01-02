import { create } from "zustand";
import { getItem, setItem } from "@/src/utils/storage";

const LANGUAGE_KEY = "gm_language_selected_v1";
const SELECTED_LANGUAGE_KEY = "gm_selected_language_v1";

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिंदी" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];

type LanguageState = {
  languageSelected: boolean;
  selectedLanguage: LanguageCode;
  isChanging: boolean;
  setLanguageSelected: (selected: boolean) => Promise<void>;
  setSelectedLanguage: (lang: LanguageCode) => Promise<void>;
  hydrate: () => Promise<void>;
  syncWithI18n: () => Promise<void>;
};

export const useLanguageStore = create<LanguageState>((set, get) => ({
  languageSelected: false,
  selectedLanguage: "en",
  isChanging: false,

  setLanguageSelected: async (selected) => {
    set({ languageSelected: selected });
    await setItem(LANGUAGE_KEY, JSON.stringify(selected));
  },

  setSelectedLanguage: async (lang) => {
    // Validate language code
    if (!SUPPORTED_LANGUAGES.some(l => l.code === lang)) {
      console.warn(`[LanguageStore] Invalid language code: ${lang}, falling back to 'en'`);
      lang = "en";
    }

    set({ isChanging: true });
    
    try {
      // Update state
      set({ selectedLanguage: lang, languageSelected: true });
      
      // Persist to storage
      await Promise.all([
        setItem(SELECTED_LANGUAGE_KEY, lang),
        setItem(LANGUAGE_KEY, JSON.stringify(true)),
      ]);
      
      // Update i18n if available
      try {
        const i18nModule = await import("i18next");
        const i18n = i18nModule.default;
        if (i18n && i18n.isInitialized && i18n.changeLanguage) {
          await i18n.changeLanguage(lang);
          console.log(`[LanguageStore] Language changed to: ${lang}`);
        }
      } catch (e) {
        console.warn("[LanguageStore] Could not update i18n:", e);
        // i18n not available yet, will be set when initialized
      }
    } catch (error) {
      console.error("[LanguageStore] Error setting language:", error);
      throw error;
    } finally {
      set({ isChanging: false });
    }
  },

  hydrate: async () => {
    try {
      const [selectedJson, langJson] = await Promise.all([
        getItem(LANGUAGE_KEY),
        getItem(SELECTED_LANGUAGE_KEY),
      ]);

      if (selectedJson) {
        try {
          const selected = JSON.parse(selectedJson) === true;
          set({ languageSelected: selected });
        } catch (e) {
          console.warn("[LanguageStore] Could not parse language selected flag:", e);
        }
      }

      if (langJson) {
        // Validate language code
        if (SUPPORTED_LANGUAGES.some(l => l.code === langJson)) {
          set({ selectedLanguage: langJson as LanguageCode });
          console.log(`[LanguageStore] Hydrated language: ${langJson}`);
        } else {
          console.warn(`[LanguageStore] Invalid stored language: ${langJson}, using default 'en'`);
          set({ selectedLanguage: "en" });
        }
      }
      
      // Sync with i18n after hydration
      await get().syncWithI18n();
    } catch (error) {
      console.warn("[LanguageStore] Hydration error:", error);
    }
  },

  syncWithI18n: async () => {
    const { selectedLanguage, languageSelected } = get();
    
    // Only sync if language was explicitly selected
    if (!languageSelected) {
      return;
    }
    
    try {
      const i18nModule = await import("i18next");
      const i18n = i18nModule.default;
      
      if (i18n && i18n.isInitialized) {
        // Check if current i18n language matches store
        if (i18n.language !== selectedLanguage) {
          console.log(`[LanguageStore] Syncing i18n from ${i18n.language} to ${selectedLanguage}`);
          await i18n.changeLanguage(selectedLanguage);
        }
      }
    } catch (e) {
      console.warn("[LanguageStore] Could not sync with i18n:", e);
    }
  },
}));


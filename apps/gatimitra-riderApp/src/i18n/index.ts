/**
 * i18n Configuration for GatiMitra Rider App
 * Supports 10 languages with complete translations
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Import all translations
import { en } from "./locales/en";
import { hi } from "./locales/hi";
import { mr } from "./locales/mr";
import { ta } from "./locales/ta";
import { te } from "./locales/te";
import { kn } from "./locales/kn";
import { gu } from "./locales/gu";
import { bn } from "./locales/bn";
import { ml } from "./locales/ml";
import { pa } from "./locales/pa";

// Configure resources
const resources = {
  en: { translation: en },
  hi: { translation: hi },
  mr: { translation: mr },
  ta: { translation: ta },
  te: { translation: te },
  kn: { translation: kn },
  gu: { translation: gu },
  bn: { translation: bn },
  ml: { translation: ml },
  pa: { translation: pa },
};

export function initI18n() {
  if (i18n.isInitialized) return i18n;

  // Try to get saved language from storage (will be set by language store)
  let savedLanguage = "en";
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = window.localStorage.getItem("gm_selected_language_v1");
      if (saved) savedLanguage = saved;
    }
  } catch (e) {
    // Ignore storage errors
    console.warn("[i18n] Could not access localStorage:", e);
  }

  i18n.use(initReactI18next).init({
    resources,
    lng: savedLanguage, // Use saved language or default to English
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v4",
    // Add support for missing keys handling
    saveMissing: false,
    missingKeyHandler: (lng, ns, key) => {
      if (__DEV__) {
        console.warn(`[i18n] Missing translation key: ${key} for language: ${lng}`);
      }
    },
  });

  // Listen for language changes and sync to storage
  i18n.on("languageChanged", (lng) => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("gm_selected_language_v1", lng);
      }
    } catch (e) {
      console.warn("[i18n] Could not save language to localStorage:", e);
    }
  });

  return i18n;
}

// Export the i18n instance
export default i18n;

// Export types for type safety
export type { TranslationKeys } from "./locales/en";

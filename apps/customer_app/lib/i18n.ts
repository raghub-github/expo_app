/**
 * App i18n – syncs with language store so selected language applies app-wide.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { AppLanguage } from "@/store/languageStore";

import en from "../locales/en.json";
import hi from "../locales/hi.json";

const resources = {
  en: { translation: en },
  hi: { translation: hi },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  compatibilityJSON: "v4",
  interpolation: { escapeValue: false },
});

export function setAppLanguage(code: AppLanguage): void {
  i18n.changeLanguage(code);
}

export default i18n;

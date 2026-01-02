/**
 * Custom hooks for i18n usage
 * Provides convenient hooks for translation and formatting
 */

import { useTranslation } from "react-i18next";
import { useFormatters } from "../utils/formatters";
import { 
  translateOrderCategory, 
  translateOrderStatus, 
  translateErrorMessage 
} from "../utils/dynamicTranslation";

/**
 * Enhanced translation hook with formatters
 */
export function useTranslations() {
  const { t, i18n } = useTranslation();
  const formatters = useFormatters(i18n.language);

  return {
    t,
    i18n,
    language: i18n.language,
    ...formatters,
    // Dynamic translations
    translateOrderCategory: (category: string) => translateOrderCategory(category, t),
    translateOrderStatus: (status: string) => translateOrderStatus(status, t),
    translateError: (error: string | Error) => translateErrorMessage(error, t),
  };
}

/**
 * Hook to get current language information
 */
export function useCurrentLanguage() {
  const { i18n } = useTranslation();
  
  return {
    code: i18n.language,
    isRTL: false, // All supported languages are LTR for now
    changeLanguage: (lng: string) => i18n.changeLanguage(lng),
  };
}


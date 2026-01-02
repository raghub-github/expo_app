/**
 * Dynamic Data Translation Utilities
 * Provides utilities for translating dynamic content from API responses
 */

import type { TFunction } from "i18next";

/**
 * Translate order category from API response
 */
export function translateOrderCategory(category: string, t: TFunction): string {
  const categoryKey = `orderCategories.${category.toLowerCase()}`;
  const translated = t(categoryKey);
  
  // If translation key doesn't exist, return the category as-is (capitalized)
  if (translated === categoryKey) {
    return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  }
  
  return translated;
}

/**
 * Translate order status from API response
 */
export function translateOrderStatus(status: string, t: TFunction): string {
  const statusKey = `orderStatus.${camelCase(status)}`;
  const translated = t(statusKey);
  
  // If translation key doesn't exist, return the status as-is (formatted)
  if (translated === statusKey) {
    return status.split("_").map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(" ");
  }
  
  return translated;
}

/**
 * Convert snake_case or SCREAMING_SNAKE_CASE to camelCase
 */
function camelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Translate dynamic content object
 * Useful for translating multiple fields at once
 */
export function translateDynamicContent<T extends Record<string, any>>(
  data: T,
  translations: Partial<Record<keyof T, string | ((value: any, t: TFunction) => string)>>,
  t: TFunction
): T {
  const translated = { ...data };
  
  for (const [key, translator] of Object.entries(translations)) {
    if (key in translated) {
      if (typeof translator === "function") {
        translated[key as keyof T] = translator(translated[key as keyof T], t);
      } else if (typeof translator === "string") {
        translated[key as keyof T] = t(translator, { value: translated[key as keyof T] });
      }
    }
  }
  
  return translated;
}

/**
 * Translate error messages from API
 */
export function translateErrorMessage(error: string | Error, t: TFunction): string {
  const errorMessage = typeof error === "string" ? error : error.message;
  
  // Check if we have a translation for this specific error
  const errorKey = `errors.${camelCase(errorMessage)}`;
  const translated = t(errorKey);
  
  if (translated !== errorKey) {
    return translated;
  }
  
  // Check for common error patterns
  if (errorMessage.toLowerCase().includes("network")) {
    return t("errors.networkError");
  }
  if (errorMessage.toLowerCase().includes("server")) {
    return t("errors.serverError");
  }
  if (errorMessage.toLowerCase().includes("session") || errorMessage.toLowerCase().includes("expired")) {
    return t("errors.sessionExpired");
  }
  
  // Fallback to generic error
  return t("errors.unknownError");
}

/**
 * Translate list of items (e.g., for dropdowns, filters)
 */
export function translateList<T extends { id: string; name: string }>(
  items: T[],
  translationKeyPrefix: string,
  t: TFunction
): T[] {
  return items.map(item => ({
    ...item,
    name: t(`${translationKeyPrefix}.${item.id}`, { defaultValue: item.name }),
  }));
}

/**
 * Get translated validation message
 */
export function getValidationMessage(
  field: string,
  validationType: "required" | "invalid" | "min" | "max",
  t: TFunction,
  options?: { min?: number; max?: number }
): string {
  if (validationType === "required") {
    return t("errors.required");
  }
  
  if (validationType === "invalid") {
    return t("errors.invalidInput");
  }
  
  if (validationType === "min" && options?.min !== undefined) {
    return t("errors.minLength", { field, min: options.min });
  }
  
  if (validationType === "max" && options?.max !== undefined) {
    return t("errors.maxLength", { field, max: options.max });
  }
  
  return t("errors.invalidInput");
}

/**
 * Create a translator function for a specific namespace
 * Useful for component-specific translations
 */
export function createNamespacedTranslator(namespace: string, t: TFunction) {
  return (key: string, options?: any) => t(`${namespace}.${key}`, options);
}


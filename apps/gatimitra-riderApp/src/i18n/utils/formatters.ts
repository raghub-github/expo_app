/**
 * Locale-aware Formatters
 * Provides formatting utilities for numbers, currency, and dates based on selected language
 */

import type { TFunction } from "i18next";

/**
 * Language to locale mapping for Intl API
 */
const LANGUAGE_TO_LOCALE: Record<string, string> = {
  en: "en-IN", // English (India)
  hi: "hi-IN", // Hindi (India)
  mr: "mr-IN", // Marathi (India)
  ta: "ta-IN", // Tamil (India)
  te: "te-IN", // Telugu (India)
  kn: "kn-IN", // Kannada (India)
  gu: "gu-IN", // Gujarati (India)
  bn: "bn-IN", // Bengali (India)
  ml: "ml-IN", // Malayalam (India)
  pa: "pa-IN", // Punjabi (India)
};

/**
 * Get locale string from language code
 */
export function getLocale(language: string): string {
  return LANGUAGE_TO_LOCALE[language] || "en-IN";
}

/**
 * Format currency amount
 * @param amount - Amount to format
 * @param language - Current language code
 * @param currencyCode - Currency code (default: INR)
 */
export function formatCurrency(
  amount: number,
  language: string,
  currencyCode: string = "INR"
): string {
  const locale = getLocale(language);
  
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    // Fallback to simple formatting
    return `₹${amount.toFixed(2)}`;
  }
}

/**
 * Format number with locale-specific separators
 */
export function formatNumber(
  value: number,
  language: string,
  options?: Intl.NumberFormatOptions
): string {
  const locale = getLocale(language);
  
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch (error) {
    // Fallback to simple formatting
    return value.toLocaleString();
  }
}

/**
 * Format date based on locale
 */
export function formatDate(
  date: Date | string | number,
  language: string,
  format: "short" | "medium" | "long" | "full" = "medium"
): string {
  const locale = getLocale(language);
  const dateObj = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return String(date);
  }
  
  const options: Intl.DateTimeFormatOptions = {
    short: { year: "numeric", month: "2-digit", day: "2-digit" },
    medium: { year: "numeric", month: "short", day: "numeric" },
    long: { year: "numeric", month: "long", day: "numeric" },
    full: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  }[format];
  
  try {
    return new Intl.DateTimeFormat(locale, options).format(dateObj);
  } catch (error) {
    // Fallback to ISO string
    return dateObj.toLocaleDateString();
  }
}

/**
 * Format time based on locale
 */
export function formatTime(
  date: Date | string | number,
  language: string,
  use24Hour: boolean = false
): string {
  const locale = getLocale(language);
  const dateObj = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return String(date);
  }
  
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: !use24Hour,
    }).format(dateObj);
  } catch (error) {
    // Fallback
    return dateObj.toLocaleTimeString();
  }
}

/**
 * Format date and time together
 */
export function formatDateTime(
  date: Date | string | number,
  language: string,
  format: "short" | "medium" | "long" = "medium"
): string {
  const locale = getLocale(language);
  const dateObj = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return String(date);
  }
  
  const options: Intl.DateTimeFormatOptions = {
    short: { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
    medium: { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
    long: { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" },
  }[format];
  
  try {
    return new Intl.DateTimeFormat(locale, options).format(dateObj);
  } catch (error) {
    // Fallback
    return dateObj.toLocaleString();
  }
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(
  date: Date | string | number,
  language: string
): string {
  const locale = getLocale(language);
  const dateObj = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return String(date);
  }
  
  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    
    if (Math.abs(diffSec) < 60) {
      return rtf.format(diffSec, "second");
    } else if (Math.abs(diffMin) < 60) {
      return rtf.format(diffMin, "minute");
    } else if (Math.abs(diffHour) < 24) {
      return rtf.format(diffHour, "hour");
    } else {
      return rtf.format(diffDay, "day");
    }
  } catch (error) {
    // Fallback to simple formatting
    if (diffMs < 0) {
      return `${Math.abs(diffDay)} days ago`;
    } else {
      return `in ${diffDay} days`;
    }
  }
}

/**
 * Format distance (km/miles based on locale)
 */
export function formatDistance(
  distanceKm: number,
  language: string,
  precision: number = 1
): string {
  // For India, we use kilometers
  return `${distanceKm.toFixed(precision)} km`;
}

/**
 * Format percentage
 */
export function formatPercentage(
  value: number,
  language: string,
  decimals: number = 0
): string {
  const locale = getLocale(language);
  
  try {
    return new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value / 100);
  } catch (error) {
    // Fallback
    return `${value.toFixed(decimals)}%`;
  }
}

/**
 * Format phone number based on locale
 */
export function formatPhoneNumber(
  phoneNumber: string,
  language: string = "en"
): string {
  // Remove all non-digits
  const cleaned = phoneNumber.replace(/\D/g, "");
  
  // Format for Indian numbers (10 digits + country code)
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  } else if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  
  return phoneNumber;
}

/**
 * Hook to get all formatters with current language
 */
export function useFormatters(language: string) {
  return {
    formatCurrency: (amount: number, currencyCode?: string) => 
      formatCurrency(amount, language, currencyCode),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => 
      formatNumber(value, language, options),
    formatDate: (date: Date | string | number, format?: "short" | "medium" | "long" | "full") => 
      formatDate(date, language, format),
    formatTime: (date: Date | string | number, use24Hour?: boolean) => 
      formatTime(date, language, use24Hour),
    formatDateTime: (date: Date | string | number, format?: "short" | "medium" | "long") => 
      formatDateTime(date, language, format),
    formatRelativeTime: (date: Date | string | number) => 
      formatRelativeTime(date, language),
    formatDistance: (distanceKm: number, precision?: number) => 
      formatDistance(distanceKm, language, precision),
    formatPercentage: (value: number, decimals?: number) => 
      formatPercentage(value, language, decimals),
    formatPhoneNumber: (phoneNumber: string) => 
      formatPhoneNumber(phoneNumber, language),
  };
}


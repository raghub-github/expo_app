/**
 * Mobile Number Normalization Utility
 * Normalizes Indian mobile numbers to 12-digit format (91 + 10 digits)
 */

/**
 * Normalize mobile number to 12-digit format (91XXXXXXXXXX)
 * - If input is +91XXXXXXXXXX (13 chars), remove + and return 91XXXXXXXXXX
 * - If input is 91XXXXXXXXXX (12 chars), return as is
 * - If input is XXXXXXXXXX (10 chars), add 91 prefix to return 91XXXXXXXXXX
 * - If input is 0XXXXXXXXXX (11 chars starting with 0), remove 0 and add 91
 * - Handles spaces and other formatting
 */
export function normalizeMobileNumber(mobile: string): string {
  if (!mobile) return "";

  // Remove all spaces, dashes, and other non-digit characters except +
  let cleaned = mobile.trim().replace(/[\s\-\(\)]/g, "");

  // Remove + if present
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Extract only digits
  const digitsOnly = cleaned.replace(/\D/g, "");

  // If we have exactly 10 digits, add 91 prefix
  if (digitsOnly.length === 10 && /^\d{10}$/.test(digitsOnly)) {
    return `91${digitsOnly}`;
  }

  // If we have 11 digits starting with 0, remove 0 and add 91
  if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    return `91${digitsOnly.substring(1)}`;
  }

  // If we have 12 digits starting with 91, return as is
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return digitsOnly;
  }

  // If we have 13 digits starting with 91 (after removing +), take first 12
  if (digitsOnly.length === 13 && digitsOnly.startsWith("91")) {
    return digitsOnly.substring(0, 12);
  }

  // If we have 11 digits starting with 91, return as is (shouldn't happen but handle it)
  if (digitsOnly.length === 11 && digitsOnly.startsWith("91")) {
    return digitsOnly;
  }

  // If we have exactly 12 digits (not starting with 91), return as is (might be valid)
  if (digitsOnly.length === 12 && /^\d{12}$/.test(digitsOnly)) {
    return digitsOnly;
  }

  // If we can't normalize properly, return the digits only (let validation catch it)
  return digitsOnly;
}

/**
 * Format mobile number for display (91XXXXXXXXXX -> +91 XXXXXXXXXX)
 */
export function formatMobileForDisplay(mobile: string): string {
  if (!mobile) return "";

  const normalized = normalizeMobileNumber(mobile);
  
  if (normalized.length === 12 && normalized.startsWith("91")) {
    return `+${normalized.substring(0, 2)} ${normalized.substring(2)}`;
  }

  return normalized;
}

/**
 * Validate if mobile number is in correct format (12 digits starting with 91)
 */
export function isValidMobileNumber(mobile: string): boolean {
  if (!mobile) return false;
  
  const normalized = normalizeMobileNumber(mobile);
  return /^91\d{10}$/.test(normalized);
}

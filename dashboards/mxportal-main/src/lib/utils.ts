// Utility to normalize phone numbers (basic demo)
export function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, "");
  // Always return in format '+91XXXXXXXXXX' for 10-digit Indian numbers
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  // If already starts with '91' and is 12 digits, add '+'
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  // If already starts with '+91' and is 13 digits, return as is
  if (phone.startsWith('+91') && digits.length === 13) {
    return phone;
  }
  // Fallback: return as is
  return phone;
}

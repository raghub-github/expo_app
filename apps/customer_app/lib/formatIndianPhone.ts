/** Display Indian mobile as +91-98765-43210 when possible. */
export function formatIndianPhoneDisplay(phone?: string | null): string {
  if (!phone?.trim()) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91-${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91-${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    const local = digits.slice(1);
    return `+91-${local.slice(0, 5)}-${local.slice(5)}`;
  }
  return phone.trim();
}

/** Mask Indian mobile for display, e.g. +91-XXXXX-78981 */
export function formatIndianPhoneMasked(phone?: string | null): string {
  if (!phone?.trim()) return "—";
  const digits = phone.replace(/\D/g, "");
  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  if (local.length < 5) return "+91-XXXXX-XXXXX";
  return `+91-XXXXX-${local.slice(5)}`;
}

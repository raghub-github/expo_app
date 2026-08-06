/** Normalize / validate platform-offer coupon codes (Super Admin only). */

const CODE_RE = /^[A-Z0-9_-]+$/;

export function slugFromOfferName(name: string): string {
  const raw = String(name ?? "")
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[₹$€£]/g, "")
    .replace(/[^A-Z0-9]+/g, "");
  return raw.slice(0, 24);
}

/** Auto-generate a coupon code from the offer name (editable before save). */
export function generatePlatformOfferCouponCode(name: string): string {
  const slug = slugFromOfferName(name);
  if (slug.length >= 4) return slug;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `GM-${rand}`;
}

export function normalizePlatformOfferCouponCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

export function validatePlatformOfferCouponCode(raw: string): string | null {
  const code = normalizePlatformOfferCouponCode(raw);
  if (!code) return "Coupon code is required.";
  if (code.length < 3) return "Coupon code must be at least 3 characters.";
  if (code.length > 32) return "Coupon code must be at most 32 characters.";
  if (!CODE_RE.test(code)) return "Coupon code may only use A–Z, 0–9, underscore, and hyphen.";
  return null;
}

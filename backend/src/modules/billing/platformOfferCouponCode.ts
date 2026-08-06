/** Normalize / match platform-offer coupon codes at checkout. */

const CODE_RE = /^[A-Z0-9_-]+$/;

export function normalizePlatformOfferCouponCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

export function isValidPlatformOfferCouponCodeFormat(raw: string): boolean {
  const code = normalizePlatformOfferCouponCode(raw);
  return code.length >= 3 && code.length <= 32 && CODE_RE.test(code);
}

export function platformOfferCouponCodesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePlatformOfferCouponCode(a ?? "");
  const right = normalizePlatformOfferCouponCode(b ?? "");
  return left.length > 0 && left === right;
}

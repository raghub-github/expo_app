/**
 * Food order pickup verification — barcode/QR token matching.
 */

export type FoodPickupVerificationMethod = "barcode" | "otp";

export function normalizePickupScanValue(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** New secure tokens are case-sensitive base64url — do not uppercase when comparing. */
export function looksLikeSecurePickupToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(token.trim());
}

export function barcodeMatchesPickupToken(
  scannedRaw: string,
  opts: {
    pickupVerificationToken: string | null | undefined;
    /** order_pickup_tokens.token — preferred QR payload. */
    securePickupToken?: string | null | undefined;
    formattedOrderId: string | null | undefined;
    orderIdText: string | null | undefined;
  }
): boolean {
  const scannedExact = String(scannedRaw ?? "").trim();
  if (!scannedExact) return false;

  const secure = String(opts.securePickupToken ?? "").trim();
  if (secure && scannedExact === secure) return true;

  const scanned = normalizePickupScanValue(scannedRaw);
  if (!scanned) return false;

  const token = normalizePickupScanValue(opts.pickupVerificationToken ?? "");
  if (token && scanned === token) return true;

  const formatted = normalizePickupScanValue(opts.formattedOrderId ?? "");
  if (formatted && scanned === formatted) return true;

  const orderId = normalizePickupScanValue(opts.orderIdText ?? "");
  if (orderId && scanned === orderId) return true;

  // Bill may print order id with spaces — compare digits-only fallback
  const scanDigits = scanned.replace(/\D/g, "");
  const formattedDigits = formatted.replace(/\D/g, "");
  if (scanDigits.length >= 6 && formattedDigits && scanDigits === formattedDigits) {
    return true;
  }

  return false;
}

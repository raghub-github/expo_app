/**
 * Client-side format checks aligned with Cashfree Secure ID VRS examples.
 * @see https://www.cashfree.com/docs/api-reference/vrs/data-to-test-integration
 * @see https://www.cashfree.com/docs/api-reference/vrs/v2/driving-license/verify-driving-licence-details
 * @see https://www.cashfree.com/docs/api-reference/vrs/v2/vehicle-rc/get-vehicle-rc-details
 *
 * Cashfree samples:
 * - DL: KA0120198900984  (state + RTO + year + 7-digit serial)
 * - RC: HJ01ME5678 / PY01MW8769  (state + RTO + series + number)
 */

/** Strip spaces/hyphens — Cashfree accepts alphanumeric DL/RC values. */
export function normalizeCashfreeDocNumber(raw: string): string {
  return raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/**
 * Indian DL as used by Cashfree:
 * 2-letter state + 2-digit RTO + 4-digit year (19xx/20xx) + 7–8 digit serial.
 * Examples: KA0120198900984, KA51201900089895
 */
export function isValidCashfreeDlNumber(raw: string): boolean {
  const value = normalizeCashfreeDocNumber(raw);
  return /^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7,8}$/.test(value);
}

/**
 * Indian vehicle RC / registration as used by Cashfree:
 * - Standard: SS + 1–2 digit RTO + 1–3 letter series + 1–4 digits (e.g. PY01MW8769, HJ01ME5678)
 * - Bharat series: 22BH1234AA
 */
export function isValidCashfreeRcNumber(raw: string): boolean {
  const value = normalizeCashfreeDocNumber(raw);
  if (!value) return false;
  if (/^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/.test(value)) return true;
  // Length 7–11 covers common plates: DL1CA1234 … MH12AB1234
  if (value.length < 7 || value.length > 11) return false;
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$/.test(value);
}

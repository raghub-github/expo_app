/**
 * Indian PIN code first-2-digit → state-name mapping.
 *
 * India Post assigns pincodes by region: the first digit picks one of 8 zones
 * and the first two digits narrow it down to a state or circle. This table
 * codifies that mapping so we can deterministically resolve a state UUID from
 * the pincode ALONE — required when:
 *   - `customer_addresses.state` was stored as "—" because reverse-geocoding
 *     failed at address-save time
 *   - `pincodes` table doesn't have this pincode yet (newly onboarded area)
 *   - `pincode_post_offices` chain is incomplete and the JOIN drops out
 *
 * Without this table, the billing engine drops to env defaults and charges
 * ₹25 + ₹5/km instead of the merchant's rate-card slabs. Adding the row to
 * `pincodes`/`pincode_post_offices` is the proper long-term fix, but THIS
 * mapping unblocks billing for every customer the moment we deploy.
 *
 * Source: India Post pincode directory, Wikipedia "Postal Index Number".
 * Mappings reflect the dominant state per prefix; small overlaps exist on
 * disputed/transitional districts but billing uses state-level slabs and the
 * dominant mapping always wins.
 */

const PIN_PREFIX_TO_STATE: Record<string, string> = {
  // Zone 1 — North
  "11": "Delhi",
  "12": "Haryana",
  "13": "Haryana",
  "14": "Punjab",
  "15": "Punjab",
  "16": "Punjab",
  "17": "Himachal Pradesh",
  "18": "Jammu and Kashmir",
  "19": "Jammu and Kashmir",

  // Zone 2 — Uttar Pradesh / Uttarakhand
  "20": "Uttar Pradesh",
  "21": "Uttar Pradesh",
  "22": "Uttar Pradesh",
  "23": "Uttar Pradesh",
  "24": "Uttarakhand",
  "25": "Uttarakhand",
  "26": "Uttarakhand",
  "27": "Uttar Pradesh",
  "28": "Uttar Pradesh",

  // Zone 3 — Rajasthan / Gujarat
  "30": "Rajasthan",
  "31": "Rajasthan",
  "32": "Rajasthan",
  "33": "Rajasthan",
  "34": "Rajasthan",
  "36": "Gujarat",
  "37": "Gujarat",
  "38": "Gujarat",
  "39": "Gujarat",

  // Zone 4 — Maharashtra / Madhya Pradesh / Chhattisgarh
  "40": "Maharashtra",
  "41": "Maharashtra",
  "42": "Maharashtra",
  "43": "Maharashtra",
  "44": "Maharashtra",
  "45": "Madhya Pradesh",
  "46": "Madhya Pradesh",
  "47": "Madhya Pradesh",
  "48": "Madhya Pradesh",
  "49": "Chhattisgarh",

  // Zone 5 — Andhra Pradesh / Telangana / Karnataka
  "50": "Telangana",
  "51": "Andhra Pradesh",
  "52": "Andhra Pradesh",
  "53": "Andhra Pradesh",
  "56": "Karnataka",
  "57": "Karnataka",
  "58": "Karnataka",
  "59": "Karnataka",

  // Zone 6 — Tamil Nadu / Kerala
  "60": "Tamil Nadu",
  "61": "Tamil Nadu",
  "62": "Tamil Nadu",
  "63": "Tamil Nadu",
  "64": "Tamil Nadu",
  "67": "Kerala",
  "68": "Kerala",
  "69": "Kerala",

  // Zone 7 — West Bengal / Odisha / NE states / Sikkim
  "70": "West Bengal",
  "71": "West Bengal",
  "72": "West Bengal",
  "73": "West Bengal",
  "74": "West Bengal",
  "75": "Odisha",
  "76": "Odisha",
  "77": "Odisha",
  "78": "Assam",
  "79": "Arunachal Pradesh",

  // Zone 8 — Bihar / Jharkhand
  "80": "Bihar",
  "81": "Bihar",
  "82": "Jharkhand",
  "83": "Jharkhand",
  "84": "Bihar",
  "85": "Bihar",
};

/**
 * Returns the dominant state-name for a 6-digit pincode, or null if the
 * prefix isn't in the mapping (we don't guess — we'd rather fall back to
 * env defaults than charge the wrong state's rate card).
 */
export function stateNameFromPincode(pincode: string | null | undefined): string | null {
  if (!pincode) return null;
  const digits = String(pincode).replace(/\D/g, "");
  if (digits.length < 2) return null;
  const prefix = digits.slice(0, 2);
  return PIN_PREFIX_TO_STATE[prefix] ?? null;
}

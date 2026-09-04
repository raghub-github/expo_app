/**
 * GST place-of-supply helpers — derive from order/address/pincode, never fabricate.
 */

import { stateNameFromPincode } from "../modules/billing/pincodePrefixToState.js";

/** Official GST state codes (first 2 digits of GSTIN). */
const STATE_NAME_TO_GST_CODE: Record<string, string> = {
  "JAMMU AND KASHMIR": "01",
  "JAMMU & KASHMIR": "01",
  "HIMACHAL PRADESH": "02",
  PUNJAB: "03",
  CHANDIGARH: "04",
  UTTARAKHAND: "05",
  "UTTARANCHAL": "05",
  HARYANA: "06",
  DELHI: "07",
  "NCT OF DELHI": "07",
  "NEW DELHI": "07",
  RAJASTHAN: "08",
  "UTTAR PRADESH": "09",
  BIHAR: "10",
  SIKKIM: "11",
  "ARUNACHAL PRADESH": "12",
  NAGALAND: "13",
  MANIPUR: "14",
  MIZORAM: "15",
  TRIPURA: "16",
  MEGHALAYA: "17",
  ASSAM: "18",
  "WEST BENGAL": "19",
  JHARKHAND: "20",
  ODISHA: "21",
  ORISSA: "21",
  CHHATTISGARH: "22",
  "MADHYA PRADESH": "23",
  GUJARAT: "24",
  "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "26",
  "DADRA AND NAGAR HAVELI": "26",
  "DAMAN AND DIU": "26",
  MAHARASHTRA: "27",
  "ANDHRA PRADESH": "37",
  KARNATAKA: "29",
  GOA: "30",
  LAKSHADWEEP: "31",
  KERALA: "32",
  "TAMIL NADU": "33",
  PUDUCHERRY: "34",
  PONDICHERRY: "34",
  "ANDAMAN AND NICOBAR ISLANDS": "35",
  TELANGANA: "36",
  LADAKH: "38",
  "OTHER TERRITORY": "97",
};

function normalizeStateKey(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\(.*?\)/g, "")
    .trim();
}

export function gstStateCodeForName(stateName: string | null | undefined): string | null {
  if (!stateName?.trim()) return null;
  const key = normalizeStateKey(stateName);
  if (STATE_NAME_TO_GST_CODE[key]) return STATE_NAME_TO_GST_CODE[key];
  for (const [name, code] of Object.entries(STATE_NAME_TO_GST_CODE)) {
    if (key.includes(name) || name.includes(key)) return code;
  }
  return null;
}

/** Format as `Haryana(06)` when code known; otherwise bare state name. */
export function formatPlaceOfSupply(stateName: string | null | undefined): string | null {
  const name = stateName?.trim();
  if (!name || name === "—" || name === "-") return null;
  const cleaned = name.replace(/\(\d{2}\)\s*$/, "").trim();
  if (!cleaned) return null;
  const code = gstStateCodeForName(cleaned);
  return code ? `${cleaned}(${code})` : cleaned;
}

function extractPincode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).match(/\b(\d{6})\b/);
  return m?.[1] ?? null;
}

function looksLikeStateToken(token: string): boolean {
  const key = normalizeStateKey(token);
  if (key.length < 3) return false;
  if (STATE_NAME_TO_GST_CODE[key]) return true;
  return Object.keys(STATE_NAME_TO_GST_CODE).some(
    (name) => key.includes(name) || name.includes(key)
  );
}

/** Best-effort state from a free-form Indian address string. */
export function stateNameFromAddressText(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!.replace(/\b\d{6}\b/g, "").trim();
    if (looksLikeStateToken(part)) {
      const key = normalizeStateKey(part);
      for (const name of Object.keys(STATE_NAME_TO_GST_CODE)) {
        if (key === name || key.includes(name) || name.includes(key)) {
          // Title-case canonical-ish from the mapping key
          return name
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }
      return part;
    }
  }
  return null;
}

export type PlaceOfSupplySources = {
  /** Explicit ops override — only when intentionally configured. */
  envOverride?: string | null;
  /** Snapshot / address state field. */
  stateName?: string | null;
  /** Snapshot dropPostalCode or address postal code. */
  pincode?: string | null;
  /** Full delivery address text. */
  deliveryAddress?: string | null;
  checkoutMetadata?: Record<string, unknown> | null;
};

/**
 * Resolve place of supply from authoritative order geo signals.
 * Returns null when unknown — callers must not invent a default state.
 */
export function resolvePlaceOfSupply(sources: PlaceOfSupplySources): string | null {
  const env = sources.envOverride?.trim();
  if (env) return formatPlaceOfSupply(env) ?? env;

  const meta = sources.checkoutMetadata;
  const metaState =
    (typeof meta?.deliveryState === "string" && meta.deliveryState.trim()) ||
    (typeof meta?.state === "string" && meta.state.trim()) ||
    (typeof meta?.addressState === "string" && meta.addressState.trim()) ||
    null;
  const metaPin =
    (typeof meta?.deliveryPostalCode === "string" && meta.deliveryPostalCode.trim()) ||
    (typeof meta?.postalCode === "string" && meta.postalCode.trim()) ||
    (typeof meta?.pincode === "string" && meta.pincode.trim()) ||
    null;

  const fromState = formatPlaceOfSupply(sources.stateName) ?? formatPlaceOfSupply(metaState);
  if (fromState) return fromState;

  const pin =
    extractPincode(sources.pincode) ||
    extractPincode(metaPin) ||
    extractPincode(sources.deliveryAddress);
  const fromPin = formatPlaceOfSupply(stateNameFromPincode(pin));
  if (fromPin) return fromPin;

  return formatPlaceOfSupply(stateNameFromAddressText(sources.deliveryAddress));
}

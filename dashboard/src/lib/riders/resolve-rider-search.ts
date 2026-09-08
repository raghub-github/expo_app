/**
 * Dashboard rider search: GMR/id + Indian mobile format variants.
 * Formats supported for phone: 9999999999, +919999999999, 09999999999, 919999999999
 */

/** Parse GMR1052 or short numeric id (≤9 digits) without treating 10-digit mobiles as ids. */
export function parseNumericRiderIdFromSearch(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const gmr = /^GMR(\d+)$/i.exec(trimmed);
  if (gmr) return parseInt(gmr[1]!, 10);
  if (/^\d{1,9}$/.test(trimmed)) return parseInt(trimmed, 10);
  return null;
}

/** Phone or partial mobile search still needs Supabase lookup. */
export function riderSearchNeedsSupabaseResolve(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return parseNumericRiderIdFromSearch(trimmed) == null;
}

/** Digits-only last-10 for Indian mobiles (strips +91 / 91 / leading 0). */
export function extractIndianMobileLast10(value: string): string | null {
  const digits = value.trim().replace(/\D/g, "");
  if (!digits) return null;

  let ten: string | null = null;
  if (digits.length === 10) {
    ten = digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    ten = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    ten = digits.slice(2);
  } else if (digits.length > 10 && digits.length <= 15) {
    // +91… / 0091… etc. — last 10 digits
    ten = digits.slice(-10);
  }

  if (!ten || ten.length !== 10 || !/^\d{10}$/.test(ten)) return null;
  return ten;
}

/** Storage / input variants commonly found in riders.mobile */
export function riderMobileSearchVariants(last10: string): string[] {
  const ten = last10.replace(/\D/g, "");
  if (ten.length !== 10) return [];
  return Array.from(
    new Set([
      ten,
      `91${ten}`,
      `+91${ten}`,
      `0${ten}`,
      `+91 ${ten}`,
      `91 ${ten}`,
    ]),
  );
}

export type RiderDashboardSearchKind =
  | { kind: "id"; id: number }
  | { kind: "phone"; last10: string; variants: string[] }
  | { kind: "fuzzy"; term: string };

/**
 * Classify dashboard nav search into rider id vs phone vs fuzzy.
 * Phone wins over id whenever the input looks like a full Indian mobile.
 */
export function classifyRiderDashboardSearch(
  value: string,
): RiderDashboardSearchKind | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const gmr = /^GMR(\d+)$/i.exec(trimmed);
  if (gmr) {
    return { kind: "id", id: parseInt(gmr[1]!, 10) };
  }

  const phoneCharsOnly = /^[+\d\s\-().]*$/.test(trimmed);
  const digits = trimmed.replace(/\D/g, "");

  if (phoneCharsOnly && digits.length >= 10) {
    const last10 = extractIndianMobileLast10(trimmed);
    if (last10) {
      // Short numeric ids are 1–9 digits only; 10+ digit input is phone.
      return {
        kind: "phone",
        last10,
        variants: riderMobileSearchVariants(last10),
      };
    }
  }

  if (/^\d{1,9}$/.test(trimmed)) {
    return { kind: "id", id: parseInt(trimmed, 10) };
  }

  return { kind: "fuzzy", term: trimmed };
}

/**
 * Supabase `.or(...)` filter for mobile eq variants + ends-with last10.
 * Quotes values so `+91…` is valid PostgREST syntax.
 */
export function supabaseRiderMobileOrFilter(last10: string, variants: string[]): string {
  const parts: string[] = [];
  for (const v of variants) {
    const safe = v.replace(/"/g, "");
    parts.push(`mobile.eq."${safe}"`);
  }
  parts.push(`mobile.ilike.%${last10.replace(/"/g, "")}`);
  return parts.join(",");
}

function normalizeRiderSearchPhone(value: string): string {
  return extractIndianMobileLast10(value) ?? value.replace(/\D/g, "");
}

/** True when URL search already matches a rider loaded in dashboard context. */
export function riderSearchMatchesLoadedRider(
  search: string,
  rider: { id: number; mobile: string },
): boolean {
  const trimmed = search.trim();
  if (!trimmed) return false;
  const classified = classifyRiderDashboardSearch(trimmed);
  if (!classified) return false;
  if (classified.kind === "id") return rider.id === classified.id;
  if (classified.kind === "phone") {
    const mobile = normalizeRiderSearchPhone(rider.mobile);
    return mobile === classified.last10;
  }
  const needle = normalizeRiderSearchPhone(trimmed);
  if (!needle) return false;
  const mobile = normalizeRiderSearchPhone(rider.mobile);
  return mobile === needle || mobile.endsWith(needle) || rider.mobile.includes(trimmed);
}

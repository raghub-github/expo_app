import type { Offer } from "@/lib/database";

/** yyyy-MM-dd in local timezone for <input type="date" /> from merchant_offers.valid_from / valid_till. */
export function toLocalDateInputValue(value: unknown): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local start-of-day → timestamptz for merchant_offers.valid_from. */
export function campaignDateToValidFromIso(dateYmd: string): string {
  const m = dateYmd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(dateYmd).toISOString();
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  return new Date(y, mo, d, 0, 0, 0, 0).toISOString();
}

/** Local end-of-day → timestamptz for merchant_offers.valid_till. */
export function campaignDateToValidTillIso(dateYmd: string): string {
  const m = dateYmd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(dateYmd).toISOString();
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  return new Date(y, mo, d, 23, 59, 59, 999).toISOString();
}

/** HH:mm for <input type="time" /> from merchant_offers.applicable_time_* (time without time zone). */
export function normalizeTimeColumnForInput(time: string | null | undefined): string {
  if (!time?.trim()) return "";
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** Map API row to list card shape without refetching the page. */
export function normalizeOfferFromApi(raw: Record<string, unknown> | Offer): Offer {
  const meta = (raw.offer_metadata as Record<string, unknown>) || {};
  const menuIds =
    (raw.menu_item_ids as string[] | null | undefined) ??
    (meta.menu_item_ids as string[] | undefined) ??
    null;
  return {
    ...(raw as Offer),
    offer_id: String(raw.offer_id ?? (raw as Offer).offer_id ?? ""),
    menu_item_ids: menuIds,
    valid_from: String(raw.valid_from ?? ""),
    valid_till: String(raw.valid_till ?? ""),
    applicable_time_start:
      raw.applicable_time_start != null ? String(raw.applicable_time_start) : null,
    applicable_time_end:
      raw.applicable_time_end != null ? String(raw.applicable_time_end) : null,
    applicable_on_days: Array.isArray(raw.applicable_on_days)
      ? (raw.applicable_on_days as string[])
      : (raw as Offer).applicable_on_days ?? null,
    created_at: String(raw.created_at ?? new Date().toISOString()),
    updated_at: String(raw.updated_at ?? new Date().toISOString()),
  };
}

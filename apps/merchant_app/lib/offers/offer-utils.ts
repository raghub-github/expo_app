import type { Offer } from "@/services/offersApi";

function shapeTimeColumn(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function toOfferIso(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  const s = String(value).trim();
  const day = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (day) {
    const y = parseInt(day[1], 10);
    const mo = parseInt(day[2], 10) - 1;
    const d = parseInt(day[3], 10);
    const dt = new Date(y, mo, d, 12, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
}

/** yyyy-MM-dd in local timezone for date inputs from merchant_offers.valid_from / valid_till. */
export function toLocalDateInputValue(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const isoDay = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDay) return isoDay[1];
  }
  const iso = toOfferIso(value);
  if (!iso) return "";
  const d = new Date(iso);
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

/** HH:mm for time inputs from merchant_offers.applicable_time_* */
export function normalizeTimeColumnForInput(time: string | null | undefined): string {
  if (!time?.trim()) return "";
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
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

/** Map API row to list card shape (dates + schedule fields). */
export function normalizeOfferFromApi(raw: Record<string, unknown> | Offer): Offer {
  const meta = (raw.offer_metadata as Record<string, unknown>) || {};
  const menuIds =
    (raw.menu_item_ids as string[] | null | undefined) ??
    (meta.menu_item_ids as string[] | undefined) ??
    null;
  const validFrom = toOfferIso(raw.valid_from);
  const validTill = toOfferIso(raw.valid_till);
  return {
    ...(raw as Offer),
    offer_id: String(raw.offer_id ?? (raw as Offer).offer_id ?? ""),
    menu_item_ids: menuIds,
    valid_from: validFrom || String(raw.valid_from ?? ""),
    valid_till: validTill || String(raw.valid_till ?? ""),
    applicable_time_start: shapeTimeColumn(raw.applicable_time_start),
    applicable_time_end: shapeTimeColumn(raw.applicable_time_end),
    applicable_on_days: Array.isArray(raw.applicable_on_days)
      ? (raw.applicable_on_days as string[])
      : (raw as Offer).applicable_on_days ?? null,
    created_at: toOfferIso(raw.created_at) || new Date().toISOString(),
    updated_at: toOfferIso(raw.updated_at) || toOfferIso(raw.created_at) || new Date().toISOString(),
  };
}

/**
 * Resolve stored offer menu_item_ids (catalog item_id and/or numeric PKs)
 * onto current menu catalog item_id strings. Used for Applies-to counts + Review.
 */
export function resolveMenuItemSelection(
  selectedIds: string[] | null | undefined,
  menuItems: Array<{ item_id: string; id?: number | null }>
): string[] {
  if (!selectedIds?.length || !menuItems.length) return [];
  const byItemId = new Set(menuItems.map((m) => String(m.item_id).trim()).filter(Boolean));
  const byPk = new Map<string, string>();
  for (const m of menuItems) {
    if (m.id == null) continue;
    const pk = Number(m.id);
    if (!Number.isFinite(pk) || pk <= 0) continue;
    byPk.set(String(pk), String(m.item_id).trim());
  }
  const out = new Set<string>();
  for (const raw of selectedIds) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    if (byItemId.has(s)) out.add(s);
    else if (byPk.has(s)) out.add(byPk.get(s)!);
  }
  return [...out];
}

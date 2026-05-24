import type { Addon, Customization, Variant } from "@/app/dashboard/merchants/stores/[id]/menu/menu-types";

/** Coerce Postgres / JSON ids (string | number) to a finite positive integer. */
export function toFiniteMenuId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function normalizeAddonFromApi(row: Record<string, unknown>, customizationPk: number): Addon {
  return {
    id: toFiniteMenuId(row.id) ?? undefined,
    addon_id: String(row.addon_id ?? ""),
    customization_id: customizationPk,
    addon_name: String(row.addon_name ?? ""),
    addon_price:
      typeof row.addon_price === "string" ? Number(row.addon_price) : Number(row.addon_price ?? 0),
    addon_image_url: row.addon_image_url != null ? String(row.addon_image_url) : undefined,
    addon_size_value:
      row.addon_size_value != null && row.addon_size_value !== ""
        ? Number(row.addon_size_value)
        : undefined,
    addon_size_unit: row.addon_size_unit != null ? String(row.addon_size_unit) : undefined,
    display_order: Number(row.display_order ?? 0),
    in_stock: row.in_stock !== false,
  };
}

export function normalizeCustomizationFromApi(
  row: Record<string, unknown>,
  menuItemId: number
): Customization {
  const pk = toFiniteMenuId(row.id) ?? 0;
  const addonsRaw = Array.isArray(row.addons) ? row.addons : [];
  return {
    id: pk > 0 ? pk : undefined,
    customization_id: String(row.customization_id ?? ""),
    menu_item_id: menuItemId,
    customization_title: String(row.customization_title ?? ""),
    customization_type: row.customization_type != null ? String(row.customization_type) : undefined,
    is_required: Boolean(row.is_required),
    min_selection: Number(row.min_selection ?? 0),
    max_selection: Number(row.max_selection ?? 1),
    display_order: Number(row.display_order ?? 0),
    addons: addonsRaw.map((o) =>
      normalizeAddonFromApi(o as Record<string, unknown>, pk)
    ),
  };
}

function sortByLowestId<T extends { id?: unknown }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => (toFiniteMenuId(a.id) ?? Number.MAX_SAFE_INTEGER) - (toFiniteMenuId(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
}

/** Drop duplicate addons by id and by name (keeps lowest id / first name). */
export function dedupeAddons(addons: Addon[]): Addon[] {
  const seenId = new Set<number>();
  const seenName = new Set<string>();
  const out: Addon[] = [];
  for (const a of sortByLowestId(addons)) {
    const aid = toFiniteMenuId(a.id);
    if (aid != null) {
      if (seenId.has(aid)) continue;
      seenId.add(aid);
    }
    const nameKey = String(a.addon_name ?? "").trim().toLowerCase();
    if (nameKey) {
      if (seenName.has(nameKey)) continue;
      seenName.add(nameKey);
    }
    out.push(a);
  }
  return out;
}

/** Drop duplicate groups by id and title; dedupe addons inside each group. */
export function dedupeCustomizationGroups(groups: Customization[]): Customization[] {
  const seenGroup = new Set<number>();
  const seenTitle = new Set<string>();
  const out: Customization[] = [];
  for (const g of sortByLowestId(groups)) {
    const gid = toFiniteMenuId(g.id);
    if (gid != null) {
      if (seenGroup.has(gid)) continue;
      seenGroup.add(gid);
    }
    const titleKey = String(g.customization_title ?? "").trim().toLowerCase();
    if (titleKey) {
      if (seenTitle.has(titleKey)) continue;
      seenTitle.add(titleKey);
    }
    out.push({ ...g, addons: dedupeAddons(g.addons ?? []) });
  }
  return out;
}

/** Drop duplicate variants by id and variant_name (keeps lowest id / first name). */
export function dedupeVariants(variants: Variant[]): Variant[] {
  const seenId = new Set<number>();
  const seenName = new Set<string>();
  const out: Variant[] = [];
  for (const v of sortByLowestId(variants)) {
    const vid = toFiniteMenuId(v.id);
    if (vid != null) {
      if (seenId.has(vid)) continue;
      seenId.add(vid);
    }
    const nameKey = String(v.variant_name ?? "").trim().toLowerCase();
    if (nameKey) {
      if (seenName.has(nameKey)) continue;
      seenName.add(nameKey);
    }
    out.push(v);
  }
  return out;
}

export function customizationGroupIds(groups: Customization[]): number[] {
  return groups.map((c) => toFiniteMenuId(c.id)).filter((id): id is number => id != null);
}

export function addonIdsForGroup(group: Customization): number[] {
  return (group.addons ?? []).map((o) => toFiniteMenuId(o.id)).filter((id): id is number => id != null);
}

export function buildInitialAddonIdMap(groups: Customization[]): Record<number, number[]> {
  const map: Record<number, number[]> = {};
  for (const g of groups) {
    const gid = toFiniteMenuId(g.id);
    if (gid == null) continue;
    map[gid] = addonIdsForGroup(g);
  }
  return map;
}

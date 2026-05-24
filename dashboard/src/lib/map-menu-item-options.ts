import type { Customization, Variant } from "@/app/dashboard/merchants/stores/[id]/menu/menu-types";
import { normalizeVariantSizeValue } from "@/lib/menu-variant-size";
import {
  buildInitialAddonIdMap,
  customizationGroupIds,
  dedupeCustomizationGroups,
  dedupeVariants,
  normalizeCustomizationFromApi,
  toFiniteMenuId,
} from "@/lib/menu-customization-normalize";

export function mapVariantsFromApi(rows: unknown[], menuItemId: number): Variant[] {
  const mapped = (rows ?? []).map((v) => {
    const row = v as Record<string, unknown>;
    return {
      id: toFiniteMenuId(row.id) ?? undefined,
      variant_id: String(row.variant_id ?? ""),
      menu_item_id: menuItemId,
      variant_name: String(row.variant_name ?? ""),
      variant_type: row.variant_type != null ? String(row.variant_type) : undefined,
      variant_price:
        typeof row.variant_price === "string"
          ? Number(row.variant_price)
          : Number(row.variant_price ?? 0),
      variant_size_value: normalizeVariantSizeValue(row.variant_size_value) ?? undefined,
      variant_size_unit:
        row.variant_size_unit != null ? String(row.variant_size_unit) : undefined,
      in_stock: row.in_stock !== false,
      display_order: Number(row.display_order ?? 0),
      is_default: row.is_default === true,
    };
  });
  return dedupeVariants(mapped);
}

export function mapCustomizationsFromApi(rows: unknown[], menuItemId: number): Customization[] {
  return dedupeCustomizationGroups(
    (rows ?? []).map((c) =>
      normalizeCustomizationFromApi(c as Record<string, unknown>, menuItemId)
    )
  );
}

export function mapAddonsFromApiRows(rows: Record<string, unknown>[]) {
  return rows.map((o) => ({
    id: Number(o.id),
    addon_id: o.addon_id,
    addon_name: o.addon_name,
    addon_price: o.addon_price,
    addon_image_url: o.addon_image_url ?? null,
    addon_size_value:
      o.addon_size_value != null && o.addon_size_value !== ""
        ? Number(o.addon_size_value)
        : null,
    addon_size_unit: o.addon_size_unit ?? null,
    display_order: o.display_order ?? 0,
    in_stock: o.in_stock ?? true,
  }));
}

export function buildEditOptionsRefs(customizations: Customization[]) {
  return {
    custIds: customizationGroupIds(customizations),
    addonMap: buildInitialAddonIdMap(customizations),
  };
}

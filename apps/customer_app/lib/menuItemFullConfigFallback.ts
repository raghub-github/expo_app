import type { MenuItem, MenuItemFullConfig } from "@/services/merchant.service";

/** API `item_id`; cart lines may use numeric menu PK only. */
export function resolveFullConfigItemId(item: Pick<MenuItem, "id" | "menuItemId">): string {
  const idStr = String(item.id ?? "").trim();
  const pkStr = item.menuItemId != null ? String(item.menuItemId) : "";
  if (idStr && idStr !== pkStr) return idStr;
  return pkStr || idStr;
}

/**
 * Instant sheet paint from the list row — no network.
 * Real `/full-config` replaces this when it arrives (variants/addons).
 */
export function buildMenuItemFullConfigFallback(item: MenuItem): MenuItemFullConfig {
  const id = resolveFullConfigItemId(item) || String(item.id ?? "").trim() || "item";
  return {
    item: {
      id,
      menuItemId: item.menuItemId,
      name: String(item.name ?? "").trim() || "Item",
      description: item.description?.trim() ? item.description : null,
      price: Number(item.price) || 0,
      imageUrl: item.imageUrl?.trim() ? item.imageUrl : null,
      isVeg: item.isVeg !== false,
      hasCustomizations: !!item.hasCustomizations,
      hasAddons: !!item.hasAddons,
      hasVariants: !!item.hasVariants,
      sizeValue: item.sizeValue ?? null,
      sizeUnit: item.sizeUnit ?? null,
      sizePreset: item.sizePreset ?? null,
    },
    variants: [],
    customizations: [],
  };
}

export function menuItemNeedsServerOptions(
  item: Pick<MenuItem, "hasVariants" | "hasAddons" | "hasCustomizations">
): boolean {
  return !!(item.hasVariants || item.hasAddons || item.hasCustomizations);
}

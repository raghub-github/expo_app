import type { CartItem } from "@/store/cartStore";

/** Per-unit add-on total for one cart line (not multiplied by item quantity). */
export function cartAddonTotalPerUnit(item: CartItem): number {
  return (item.addons ?? []).reduce((s, a) => s + a.addonPrice * (a.quantity || 1), 0);
}

/**
 * Base/variant price per unit for billing — excludes add-ons.
 * `price` on customized lines is all-in (base + add-ons); menu sync may overwrite
 * `basePrice` with the listing minimum — infer from price − add-ons when needed.
 */
export function cartLineBaseUnitPrice(item: CartItem): number {
  const addonPerUnit = cartAddonTotalPerUnit(item);
  const inferred = Math.max(0, item.price - addonPerUnit);
  if (item.basePrice != null && item.basePrice > 0) {
    if (addonPerUnit <= 0.005) return item.basePrice;
    if (Math.abs(item.basePrice - inferred) <= 2) return item.basePrice;
  }
  return inferred > 0.005 ? inferred : item.basePrice ?? item.price;
}

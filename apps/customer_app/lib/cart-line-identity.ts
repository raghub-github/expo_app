/**
 * Cart line identity — merge only when menu item, variant, add-ons, and instruction match.
 */

import type { CartItem, CartItemAddon } from "@/store/cartStore";
import { normalizeOrderItemSpecialInstructions } from "@/lib/order-item-special-instructions";

export type CartLineIdentityInput = {
  menuItemId: string;
  variantId?: string | null;
  addons?: CartItemAddon[];
  specialInstructions?: string | null;
};

export function cartItemBaseId(menuItemId: string): string {
  if (menuItemId.includes("::")) return menuItemId.split("::")[0]!;
  if (menuItemId.includes("_")) return menuItemId.split("_")[0]!;
  return menuItemId;
}

export function buildCompositeMenuItemId(args: {
  baseMenuItemId: string;
  variantId?: string | null;
  addonIds: string[];
}): string {
  const base = cartItemBaseId(args.baseMenuItemId);
  const variant = (args.variantId ?? "").trim();
  const addons = [...args.addonIds].map((id) => id.trim()).filter(Boolean).sort();
  if (!variant && addons.length === 0) return base;
  return `${base}_${variant}_${addons.join(",")}`;
}

function identityFromCartItem(item: CartLineIdentityInput): {
  base: string;
  variant: string;
  addons: string;
  note: string;
} {
  const base = cartItemBaseId(item.menuItemId);
  const variant = (item.variantId ?? "").trim();
  const addons = (item.addons ?? [])
    .map((a) => String(a.addonId ?? "").trim())
    .filter(Boolean)
    .sort()
    .join(",");
  const note = normalizeOrderItemSpecialInstructions(item.specialInstructions) ?? "";
  return { base, variant, addons, note };
}

/** Stable per-line id used for quantity updates and checkout edits. */
export function buildCartLineId(item: CartLineIdentityInput): string {
  const { base, variant, addons, note } = identityFromCartItem(item);
  return [base, variant, addons, note].join("::");
}

export function cartLinesMatch(a: CartLineIdentityInput, b: CartLineIdentityInput): boolean {
  return buildCartLineId(a) === buildCartLineId(b);
}

export function ensureCartLineId(item: CartItem): string {
  if (item.lineId?.trim()) return item.lineId.trim();
  return buildCartLineId(item);
}

export function hydrateCartLine(item: CartItem): CartItem {
  const specialInstructions = normalizeOrderItemSpecialInstructions(item.specialInstructions);
  return {
    ...item,
    lineId: ensureCartLineId({ ...item, specialInstructions }),
    specialInstructions,
  };
}

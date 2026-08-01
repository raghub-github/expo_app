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

/** True when a cart line belongs to the given menu catalog item (base / composite id). */
export function cartLineMatchesMenuItem(
  line: CartLineIdentityInput,
  menuItemId: string,
  menuItemNumericId?: number | null
): boolean {
  const base = cartItemBaseId(line.menuItemId);
  const ids = new Set<string>([String(menuItemId)]);
  if (menuItemNumericId != null && Number.isFinite(menuItemNumericId)) {
    ids.add(String(menuItemNumericId));
  }
  if (ids.has(base) || ids.has(line.menuItemId)) return true;
  for (const id of ids) {
    if (line.menuItemId.startsWith(`${id}_`)) return true;
  }
  return false;
}

/**
 * Prefill cooking request / qty when reopening an item sheet for something already
 * in the cart. Prefers the newest line that has a note; returns total qty across
 * matching lines so an edit can consolidate duplicates into one line.
 */
export function findCartLinePrefillForMenuItem(args: {
  cartItems: CartItem[];
  menuItemId: string;
  menuItemNumericId?: number | null;
}): {
  lineId: string | null;
  siblingLineIds: string[];
  specialInstructions: string | null;
  quantity: number;
  variantId?: string | null;
  variantName?: string | null;
  addons?: Array<{ addonId: string }>;
} | null {
  const matches = args.cartItems.filter((line) =>
    cartLineMatchesMenuItem(line, args.menuItemId, args.menuItemNumericId)
  );
  if (matches.length === 0) return null;

  const withNote = [...matches]
    .reverse()
    .find((line) => normalizeOrderItemSpecialInstructions(line.specialInstructions));
  const line = withNote ?? matches[matches.length - 1]!;
  const note = normalizeOrderItemSpecialInstructions(line.specialInstructions);
  const primaryId = line.lineId?.trim() || null;
  const siblingLineIds = matches
    .map((m) => m.lineId?.trim() || "")
    .filter((id) => id && id !== primaryId);

  return {
    lineId: primaryId,
    siblingLineIds,
    specialInstructions: note,
    quantity: matches.reduce((sum, m) => sum + Math.max(1, m.quantity || 1), 0),
    variantId: line.variantId ?? null,
    variantName: line.variantName ?? null,
    addons: (line.addons ?? [])
      .map((a) => ({ addonId: String(a.addonId).trim() }))
      .filter((a) => a.addonId),
  };
}

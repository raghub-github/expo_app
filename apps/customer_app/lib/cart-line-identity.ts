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

/**
 * Catalog id only — strip variant/addon composite suffixes.
 *
 * Store SKUs often contain `_` (e.g. `SS1026_bab625…`). Never split on the first
 * `_` or every item on that store collapses to the same cart qty / line id.
 *
 * Supported composites:
 * - `base::variant::addons` (preferred)
 * - legacy `base_variant_addons` only when `addons` contains a comma (multi-addon)
 *   or when the middle+tail clearly came from buildCompositeMenuItemId with empty addons
 *   — for ambiguous single `_`, keep the full string.
 */
export function cartItemBaseId(menuItemId: string): string {
  const id = String(menuItemId ?? "").trim();
  if (!id) return id;
  if (id.includes("::")) return id.split("::")[0]!;

  // Preferred legacy composite: base_variant_addon1,addon2 (comma ⇒ definitely composite)
  const comma = id.lastIndexOf(",");
  if (comma > 0) {
    const beforeAddons = id.slice(0, id.lastIndexOf("_"));
    const variantSep = beforeAddons.lastIndexOf("_");
    if (variantSep > 0) return beforeAddons.slice(0, variantSep);
  }

  return id;
}

export function buildCompositeMenuItemId(args: {
  baseMenuItemId: string;
  variantId?: string | null;
  addonIds: string[];
}): string {
  // Keep full SKU (may contain `_`); do not truncate via cartItemBaseId.
  const base = String(args.baseMenuItemId ?? "").trim();
  const variant = (args.variantId ?? "").trim();
  const addons = [...args.addonIds].map((id) => id.trim()).filter(Boolean).sort();
  if (!variant && addons.length === 0) return base;
  return `${base}::${variant}::${addons.join(",")}`;
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

/** True when catalog id is already a positive integer menu PK string. */
export function isNumericMenuItemPk(id: string): boolean {
  const s = String(id ?? "").trim();
  return /^\d+$/.test(s) && Number(s) > 0;
}

/**
 * Swap the catalog base of a cart line id (plain or `base::variant::addons`)
 * when migrating public SKU → numeric PK. Returns null when unchanged / invalid.
 */
export function rewriteCartMenuItemBase(
  menuItemId: string,
  nextBase: string
): string | null {
  const current = String(menuItemId ?? "").trim();
  const next = String(nextBase ?? "").trim();
  if (!current || !next || !isNumericMenuItemPk(next)) return null;
  const oldBase = cartItemBaseId(current);
  if (!oldBase || oldBase === next) return null;
  if (isNumericMenuItemPk(oldBase)) return null;
  if (current === oldBase) return next;
  if (current.startsWith(`${oldBase}::`)) return `${next}${current.slice(oldBase.length)}`;
  if (current.startsWith(`${oldBase}_`)) return `${next}${current.slice(oldBase.length)}`;
  return null;
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

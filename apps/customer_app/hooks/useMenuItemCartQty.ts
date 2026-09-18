/**
 * Narrow cart-qty subscription for menu rows.
 * Matches public item id, numeric PK, and true composite suffixes
 * (`id_variant_…` / `id::…`) so home `+` flips to the stepper after addItem.
 *
 * Also reads stashed multi-store carts — otherwise adding store B hides
 * steppers on store A cards (active merchant only).
 *
 * IMPORTANT: do NOT use cartItemBaseId() here. Store SKUs like `SS1026_abc`
 * would collapse to `SS1026` and make every item on that store share one qty.
 */

import { useCartStore, type CartItem } from "@/store/cartStore";
import {
  merchantCartMatchesRoute,
  normalizeMerchantRouteId,
} from "@/lib/merchantRouteId";

function lineMatchesItem(
  menuItemId: string,
  id: string,
  numId: string | null
): boolean {
  const mid = String(menuItemId ?? "").trim();
  if (!mid) return false;
  if (id && (mid === id || mid.startsWith(id + "_") || mid.startsWith(id + "::"))) {
    return true;
  }
  if (
    numId &&
    (mid === numId || mid.startsWith(numId + "_") || mid.startsWith(numId + "::"))
  ) {
    return true;
  }
  return false;
}

function qtyFromItems(
  items: CartItem[],
  id: string,
  numId: string | null
): number {
  let best = 0;
  for (const line of items) {
    if (line.quantity <= 0) continue;
    if (lineMatchesItem(line.menuItemId, id, numId)) {
      best += line.quantity;
    }
  }
  return best;
}

function findStashItems(
  stashedCarts: Record<string, { items: CartItem[] }>,
  merchantId: string
): CartItem[] | null {
  const want = normalizeMerchantRouteId(merchantId);
  if (!want) return null;
  const direct = stashedCarts[want];
  if (direct?.items?.length) return direct.items;
  for (const [key, stash] of Object.entries(stashedCarts)) {
    if (normalizeMerchantRouteId(key) === want && stash.items?.length) {
      return stash.items;
    }
  }
  return null;
}

export function useMenuItemCartQty(
  itemId: string,
  menuItemId: number | string | undefined | null,
  merchantId: string | undefined
): number {
  const id = String(itemId ?? "").trim();
  const numId =
    menuItemId != null && String(menuItemId).trim() !== ""
      ? String(menuItemId).trim()
      : null;

  return useCartStore((s) => {
    if (merchantCartMatchesRoute(s.merchantId, merchantId)) {
      return qtyFromItems(s.items, id, numId);
    }
    if (!merchantId) return 0;
    const stashItems = findStashItems(s.stashedCarts, merchantId);
    if (!stashItems) return 0;
    return qtyFromItems(stashItems, id, numId);
  });
}

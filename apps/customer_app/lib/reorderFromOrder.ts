/**
 * Populate cart from a past order and navigate to checkout (reorder flow).
 */

import type { OrderSummary } from "@/services/order.service";
import { merchantService, type MenuItem } from "@/services/merchant.service";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { hydrateCartLine } from "@/lib/cart-line-identity";
import { normalizeOrderItemSpecialInstructions } from "@/lib/order-item-special-instructions";

function resolveItemDiet(itemVeg: string | null | undefined): "veg" | "nonveg" | "egg" | null {
  const v = (itemVeg ?? "").toLowerCase();
  if (!v) return null;
  if (v.includes("egg")) return "egg";
  if (v.includes("non")) return "nonveg";
  if (v.includes("veg")) return "veg";
  return null;
}

/** Coerce API menuItemId (string | number) — `.trim()` on a number throws / skips lines. */
export function coerceMenuItemId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

export function orderItemsMissingMenuIds(order: Pick<OrderSummary, "items">): boolean {
  const items = order.items ?? [];
  if (items.length === 0) return true;
  return items.some((i) => coerceMenuItemId(i.menuItemId) == null);
}

/** Keys for matching order lines to live menu rows (item_id string + numeric PK). */
export function buildMenuAvailabilityKeys(menu: MenuItem[]): Set<string> {
  const keys = new Set<string>();
  for (const row of menu) {
    const itemId = String(row.id ?? "").trim();
    if (itemId) keys.add(itemId);
    if (row.menuItemId != null && Number.isFinite(Number(row.menuItemId))) {
      keys.add(String(row.menuItemId));
    }
  }
  return keys;
}

export function isOrderLineOnLiveMenu(
  menuKeys: Set<string>,
  orderMenuItemId: string
): boolean {
  return menuKeys.has(orderMenuItemId);
}

export function orderItemsToCartLines(
  order: Pick<OrderSummary, "items">,
  opts?: { menuKeys?: Set<string> }
): { lines: CartItem[]; skippedNames: string[] } {
  const menuKeys = opts?.menuKeys;
  const lines: CartItem[] = [];
  const skippedNames: string[] = [];

  for (const item of order.items ?? []) {
    const menuItemId = coerceMenuItemId(item.menuItemId);
    if (!menuItemId) continue;

    if (menuKeys && !isOrderLineOnLiveMenu(menuKeys, menuItemId)) {
      const label = String(item.name ?? "Item").trim() || "Item";
      if (!skippedNames.includes(label)) skippedNames.push(label);
      continue;
    }

    const diet = resolveItemDiet(item.vegNonVeg);
    lines.push(
      hydrateCartLine({
        lineId: "",
        menuItemId,
        name: item.name,
        price: item.price,
        basePrice: item.price,
        quantity: item.quantity,
        isVeg: diet === "veg",
        variantName: item.variantName?.trim() || undefined,
        specialInstructions: normalizeOrderItemSpecialInstructions(item.specialInstructions),
      })
    );
  }

  return { lines, skippedNames };
}

export type ReorderPopulateResult =
  | {
      ok: true;
      addedCount: number;
      skippedNames: string[];
    }
  | {
      ok: false;
      reason: "no_store" | "no_items" | "all_unavailable";
      skippedNames: string[];
    };

function resolveReorderStoreId(order: OrderSummary): string | null {
  return order.merchantPublicStoreId?.trim() ?? order.merchantStoreId?.toString()?.trim() ?? null;
}

/** Reorder with live menu availability — skips OOS / removed items. */
export async function tryPopulateCartFromOrder(
  order: OrderSummary
): Promise<ReorderPopulateResult> {
  const storeId = resolveReorderStoreId(order);
  if (!storeId) {
    return { ok: false, reason: "no_store", skippedNames: [] };
  }

  let menuKeys: Set<string> | undefined;
  try {
    const detail = await merchantService.getMerchantById(storeId);
    if (detail?.menu?.length) {
      menuKeys = buildMenuAvailabilityKeys(detail.menu);
    } else {
      menuKeys = new Set();
    }
  } catch {
    return { ok: false, reason: "all_unavailable", skippedNames: [] };
  }

  const { lines, skippedNames } = orderItemsToCartLines(order, { menuKeys });
  if (lines.length === 0) {
    return {
      ok: false,
      reason: skippedNames.length > 0 ? "all_unavailable" : "no_items",
      skippedNames,
    };
  }

  const merchantName = order.merchantPublicName ?? order.merchantName ?? "Restaurant";
  useCartStore.getState().setCartForReorder(
    storeId,
    merchantName,
    lines,
    order.merchantBannerUrl ?? null
  );
  return { ok: true, addedCount: lines.length, skippedNames };
}

/** @deprecated Prefer tryPopulateCartFromOrder — does not check live stock. */
export function populateCartFromOrder(order: OrderSummary): boolean {
  const storeId = resolveReorderStoreId(order);
  if (!storeId) return false;

  const { lines } = orderItemsToCartLines(order);
  if (lines.length === 0) return false;

  const merchantName = order.merchantPublicName ?? order.merchantName ?? "Restaurant";
  useCartStore.getState().setCartForReorder(
    storeId,
    merchantName,
    lines,
    order.merchantBannerUrl ?? null
  );
  return true;
}

export function resolveOrderItemDiet(
  itemVeg: string | null | undefined
): "veg" | "nonveg" | "egg" | null {
  return resolveItemDiet(itemVeg);
}

export function formatReorderSkippedMessage(skippedNames: string[]): string {
  if (skippedNames.length === 0) return "";
  if (skippedNames.length === 1) {
    return `${skippedNames[0]} is out of stock and was not added to your cart.`;
  }
  const preview =
    skippedNames.length <= 3
      ? skippedNames.join(", ")
      : `${skippedNames.slice(0, 3).join(", ")} +${skippedNames.length - 3} more`;
  return `${skippedNames.length} items are out of stock and were not added: ${preview}.`;
}

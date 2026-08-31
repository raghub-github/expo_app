/**
 * Populate cart from a past order and navigate to checkout (reorder flow).
 */

import type { OrderSummary } from "@/services/order.service";
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

export function orderItemsToCartLines(
  order: Pick<OrderSummary, "items">
): CartItem[] {
  const lines: CartItem[] = [];
  for (const item of order.items ?? []) {
    const menuItemId = coerceMenuItemId(item.menuItemId);
    if (!menuItemId) continue;
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
  return lines;
}

export function populateCartFromOrder(order: OrderSummary): boolean {
  const storeId = order.merchantPublicStoreId?.trim() ?? order.merchantStoreId?.toString()?.trim();
  if (!storeId) return false;

  const cartLines = orderItemsToCartLines(order);
  if (cartLines.length === 0) return false;

  const merchantName = order.merchantPublicName ?? order.merchantName ?? "Restaurant";
  useCartStore.getState().setCartForReorder(
    storeId,
    merchantName,
    cartLines,
    order.merchantBannerUrl ?? null
  );
  return true;
}

export function resolveOrderItemDiet(
  itemVeg: string | null | undefined
): "veg" | "nonveg" | "egg" | null {
  return resolveItemDiet(itemVeg);
}

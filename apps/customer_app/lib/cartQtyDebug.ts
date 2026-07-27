/**
 * Dev-only cart quantity flow logging.
 * No-ops in production so logs never ship.
 *
 * Cart snapshot uses a lazy require so this module can be imported from
 * `cartStore` without a circular init cycle.
 */

type CartQtyDebugEvent =
  | "press_in"
  | "press_fallback"
  | "press_out"
  | "duplicate_blocked"
  | "add_pressed"
  | "increment_pressed"
  | "decrement_pressed"
  | "remove_triggered"
  | "optimistic_update"
  | "cart_write_scheduled"
  | "cart_write_skipped_stale"
  | "cart_write_run"
  | "store_before"
  | "store_after"
  | "store_addItem"
  | "store_updateQuantity"
  | "store_removeItem"
  | "ui_render"
  | "guard_blocked";

function snapshotCart(itemKey?: string): Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useCartStore } = require("@/store/cartStore") as typeof import("@/store/cartStore");
    const s = useCartStore.getState();
    const totalQty = s.items.reduce((n, i) => n + i.quantity, 0);
    let qtyHint: number | undefined;
    if (itemKey) {
      const idPart = itemKey.includes(":") ? itemKey.slice(itemKey.indexOf(":") + 1) : itemKey;
      qtyHint = s.items
        .filter(
          (i) =>
            i.menuItemId === idPart ||
            i.menuItemId.startsWith(`${idPart}_`) ||
            i.menuItemId.startsWith(`${idPart}::`)
        )
        .reduce((n, i) => n + i.quantity, 0);
    }
    return { merchantId: s.merchantId, lines: s.items.length, totalQty, qtyHint };
  } catch {
    return { merchantId: null, lines: -1, totalQty: -1 };
  }
}

export function cartQtyDebug(
  event: CartQtyDebugEvent,
  payload: Record<string, unknown> = {}
): void {
  if (!__DEV__) return;
  const itemKey = typeof payload.itemKey === "string" ? payload.itemKey : undefined;
  // eslint-disable-next-line no-console
  console.log(`[cart-qty] ${event}`, {
    t: Date.now(),
    cart: snapshotCart(itemKey),
    ...payload,
  });
}

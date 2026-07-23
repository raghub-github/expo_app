import { useCartStore } from "@/store/cartStore";
import { merchantCartMatchesRoute } from "@/lib/merchantRouteId";

/**
 * Per-row cart qty — narrow equality so only the tapped row re-renders.
 * Avoids SectionList/extraData re-rendering every row on cart changes.
 */
export function useMenuItemCartQty(
  itemId: string,
  menuItemId: number | undefined,
  merchantId: string | undefined
): number {
  const numId = menuItemId != null ? String(menuItemId) : null;
  return useCartStore((s) => {
    if (!merchantCartMatchesRoute(s.merchantId, merchantId)) return 0;
    let sum = 0;
    for (const line of s.items) {
      const mid = line.menuItemId;
      if (mid === itemId || mid.startsWith(`${itemId}_`) || mid.startsWith(`${itemId}::`)) {
        sum += line.quantity;
        continue;
      }
      if (
        numId != null &&
        (mid === numId || mid.startsWith(`${numId}_`) || mid.startsWith(`${numId}::`))
      ) {
        sum += line.quantity;
      }
    }
    return sum;
  });
}

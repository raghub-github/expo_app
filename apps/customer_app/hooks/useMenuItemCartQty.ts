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
    const index = s.menuItemQtyIndex;
    let sum = index[itemId] ?? 0;
    if (numId != null && numId !== itemId) {
      sum += index[numId] ?? 0;
    }
    return sum;
  });
}

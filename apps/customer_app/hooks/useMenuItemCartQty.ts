import { useCartStore } from "@/store/cartStore";

/** Per-row cart qty — avoids SectionList extraData re-rendering every row on cart changes. */
export function useMenuItemCartQty(
  itemId: string,
  menuItemId: number | undefined,
  merchantId: string | undefined
): number {
  return useCartStore((s) => {
    if (!merchantId || s.merchantId !== merchantId) return 0;
    const numId = menuItemId != null ? String(menuItemId) : null;
    let sum = 0;
    for (const line of s.items) {
      if (line.menuItemId === itemId || line.menuItemId.startsWith(`${itemId}_`)) {
        sum += line.quantity;
        continue;
      }
      if (
        numId != null &&
        (line.menuItemId === numId || line.menuItemId.startsWith(`${numId}_`))
      ) {
        sum += line.quantity;
      }
    }
    return sum;
  });
}

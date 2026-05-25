/** Max line items shown on outer order cards before "+N more". */
export const ORDER_CARD_MAX_VISIBLE_ITEMS = 3;

export function sliceOrderLineItems<T>(
  items: readonly T[]
): { visible: T[]; moreCount: number } {
  const visible = items.slice(0, ORDER_CARD_MAX_VISIBLE_ITEMS);
  return {
    visible,
    moreCount: Math.max(0, items.length - ORDER_CARD_MAX_VISIBLE_ITEMS),
  };
}

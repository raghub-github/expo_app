/** Food orders above this payable total (INR) are flagged as bulk orders. */
export const BULK_ORDER_GRAND_TOTAL_THRESHOLD_INR = 1200;

export function resolveBulkOrderPlacement(
  grandTotal: unknown,
  orderIdText: string
): { isBulkOrder: boolean; bulkOrderGroupId: string | null } {
  const total = Number(grandTotal);
  const isBulkOrder =
    Number.isFinite(total) && total > BULK_ORDER_GRAND_TOTAL_THRESHOLD_INR;
  const orderId = String(orderIdText ?? "").trim();
  return {
    isBulkOrder,
    bulkOrderGroupId: isBulkOrder && orderId ? `BULK-${orderId}` : null,
  };
}

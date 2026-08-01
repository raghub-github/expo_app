/** Prepaid vs collect-on-delivery, for the PAID badge on merchant bills. */
export function isPrepaidOrder(order: {
  paymentStatus?: string | null;
  paymentMethod?: string | null;
}): boolean {
  const status = (order.paymentStatus ?? "").trim().toUpperCase();
  if (status === "PAID" || status === "COMPLETED" || status === "SUCCESS") return true;
  const method = (order.paymentMethod ?? "").trim().toLowerCase();
  if (!method) return false;
  return !method.includes("cod") && !method.includes("cash");
}

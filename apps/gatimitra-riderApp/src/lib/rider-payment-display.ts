import type { TFunction } from "i18next";

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isCodPaymentMethod(paymentMethod: string | null | undefined): boolean {
  const method = norm(paymentMethod);
  return method === "cod" || method === "cash" || method.includes("cod");
}

export function isPrepaidPaymentMethod(
  paymentMethod: string | null | undefined,
  paymentStatus?: string | null
): boolean {
  const method = norm(paymentMethod);
  const status = norm(paymentStatus);
  if (isCodPaymentMethod(method)) return false;
  if (
    method === "online" ||
    method === "upi" ||
    method === "card" ||
    method === "wallet" ||
    method === "netbanking"
  ) {
    return true;
  }
  return status === "paid" || status === "completed" || status === "success";
}

/** Drop-order payment card title (reference: "Paid online" / COD collect). */
export function formatRiderDropPaymentLabel(
  paymentMethod: string | null | undefined,
  paymentStatus: string | null | undefined,
  t?: TFunction
): string {
  if (isCodPaymentMethod(paymentMethod)) {
    return t?.("orders.activeFood.collectCash", "Collect cash") ?? "Collect cash";
  }
  if (isPrepaidPaymentMethod(paymentMethod, paymentStatus)) {
    return t?.("orders.activeFood.paidOnline", "Paid online") ?? "Paid online";
  }
  const status = norm(paymentStatus);
  if (status === "pending" || status === "processing") {
    return t?.("orders.activeFood.paymentPending", "Payment pending") ?? "Payment pending";
  }
  const method = norm(paymentMethod);
  if (method === "other") {
    return t?.("orders.activeFood.paymentOther", "Other payment") ?? "Other payment";
  }
  if (method) {
    return method.charAt(0).toUpperCase() + method.slice(1);
  }
  return t?.("orders.activeFood.paidOnline", "Paid online") ?? "Paid online";
}

/** Order history list — "Paid online" / "Cash on Delivery" (never default to bare "Cash"). */
export function formatOrderHistoryPaymentLabel(
  paymentMethod: string | null | undefined,
  paymentStatus: string | null | undefined,
  t?: TFunction
): string | null {
  if (isCodPaymentMethod(paymentMethod)) {
    return t?.("profile.myOrders.paymentCod", "Cash on Delivery") ?? "Cash on Delivery";
  }
  const status = norm(paymentStatus);
  if (status === "pending" || status === "processing") {
    return t?.("profile.myOrders.paymentPending", "Payment pending") ?? "Payment pending";
  }
  if (isPrepaidPaymentMethod(paymentMethod, paymentStatus)) {
    return t?.("profile.myOrders.paymentOnline", "Paid online") ?? "Paid online";
  }
  const method = norm(paymentMethod);
  if (method && !isCodPaymentMethod(method)) {
    if (method === "online" || method === "upi" || method === "card" || method === "wallet") {
      return t?.("profile.myOrders.paymentOnline", "Paid online") ?? "Paid online";
    }
    return method.charAt(0).toUpperCase() + method.slice(1);
  }
  return null;
}

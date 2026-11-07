import type { TFunction } from "i18next";

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Exact customer-payable label for rider collect / paid cards.
 * Always keeps 2 decimal places when paise exist (e.g. ₹48.38).
 */
export function formatExactInr(amount: number | null | undefined): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const exact = Math.round(n * 100) / 100;
  const hasPaise = Math.round(exact * 100) % 100 !== 0;
  return `₹${exact.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
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

export type RiderDropPaymentContext = {
  /** Parcel: where cash/COD is collected. */
  payAt?: "pickup" | "drop" | null;
  /** True when cash already collected (or online already paid). */
  cashCollected?: boolean | null;
};

/** Drop-order payment card title (reference: "Paid online" / COD collect). */
export function formatRiderDropPaymentLabel(
  paymentMethod: string | null | undefined,
  paymentStatus: string | null | undefined,
  t?: TFunction,
  ctx?: RiderDropPaymentContext
): string {
  const payAt = ctx?.payAt ?? null;
  const cashCollected = ctx?.cashCollected === true;
  const fareCollectedPrepaid =
    t?.("orders.activeParcel.fareCollectedPrepaid", "Fare collected · Prepaid") ??
    "Fare collected · Prepaid";

  // Parcel / COD already taken at pickup (or marked collected) → don't ask again at drop.
  if (cashCollected) {
    if (isPrepaidPaymentMethod(paymentMethod, paymentStatus) && !isCodPaymentMethod(paymentMethod)) {
      return t?.("orders.activeFood.paidOnline", "Paid online") ?? "Paid online";
    }
    return fareCollectedPrepaid;
  }

  if (payAt === "pickup" && isCodPaymentMethod(paymentMethod)) {
    // Backend says still unpaid at pickup — rare; still prompt collect.
    return t?.("orders.activeFood.collectCash", "Collect cash") ?? "Collect cash";
  }

  if (payAt === "drop" || isCodPaymentMethod(paymentMethod)) {
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

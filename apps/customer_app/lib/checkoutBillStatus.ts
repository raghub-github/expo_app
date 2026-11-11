/**
 * Checkout bill status copy — never blame "connection" unless the failure is
 * actually a transport/network problem on an enabled billing request.
 */

import { isNetworkError } from "../utils/networkError";

export function isCanceledRequestError(err: unknown): boolean {
  const e = err as { code?: string; name?: string; message?: string };
  if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError") {
    return true;
  }
  const msg = (e?.message ?? "").toLowerCase();
  return msg === "canceled" || msg === "cancelled" || msg.includes("aborted");
}

export function isTimeoutError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT") return true;
  const msg = (e?.message ?? "").toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out");
}

export type CheckoutBillStatusInput = {
  toPayAmount: number | null | undefined;
  canRequestBilling: boolean;
  billingItemsHaveResolvableIds: boolean;
  menuLoading: boolean;
  hasPickupCoords: boolean;
  needsDeliveryAddress: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
};

export function getCheckoutBillStatusMessage(input: CheckoutBillStatusInput): string | null {
  if (input.toPayAmount != null) return null;

  if (!input.billingItemsHaveResolvableIds) {
    return input.menuLoading
      ? "Loading menu prices for your bill…"
      : "We couldn't match your cart to the menu. Tap retry.";
  }

  if (!input.canRequestBilling) {
    if (!input.hasPickupCoords) return "Restaurant location is still loading…";
    if (input.needsDeliveryAddress) return "Select a delivery address to calculate your bill.";
    return "Preparing your bill…";
  }

  if (input.isFetching) {
    return "Still calculating your bill…";
  }

  if (input.isError || input.error != null) {
    const err = input.error;
    if (isCanceledRequestError(err)) {
      return "Bill update was interrupted. Tap retry.";
    }
    if (isTimeoutError(err)) {
      return "Bill calculation timed out. Tap retry.";
    }
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401 || status === 403) {
      return "Session expired. Sign in again to continue.";
    }
    if (status != null && status >= 500) {
      return "Billing is temporarily unavailable. Tap retry.";
    }
    if (status != null && status >= 400) {
      const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      return apiMsg?.trim() || "We couldn't calculate your bill. Tap retry.";
    }
    if (isNetworkError(err)) {
      return "Can't reach the server right now. Tap retry.";
    }
    const msg = (err as Error)?.message?.trim();
    if (msg && !/network error/i.test(msg)) return msg;
    return "We couldn't calculate your bill. Tap retry.";
  }

  return "We couldn't calculate your bill. Tap retry.";
}

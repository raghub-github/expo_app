/**
 * Merchant subscription upgrade — backend merchant-partner (Partner Site parity).
 */

import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

function base() {
  return getConfig().apiBaseUrl.replace(/\/+$/, "");
}

export type CreateSubscriptionOrderResponse = {
  success: boolean;
  skipPayment?: boolean;
  orderId?: string | null;
  keyId?: string;
  amount?: number;
  currency?: string;
  isUpgrade?: boolean;
  amountToCharge?: number;
  creditApplied?: number;
  gstPercent?: number;
  plan?: { id: number; name: string; price: number };
  /** Merchant wallet AVAILABLE balance in ₹ — used by the checkout modal to
   *  render the "Pay with Wallet" option (enabled when balance ≥ amountToCharge). */
  walletAvailableBalance?: number;
  error?: string;
};

export async function createSubscriptionPaymentOrder(
  storeId: number,
  token: string,
  planId: number
): Promise<CreateSubscriptionOrderResponse> {
  const res = await authFetch(
    `${base()}/v1/merchant-partner/stores/${storeId}/subscription/create-payment-order`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ planId }),
    }
  );
  const data = (await res.json()) as CreateSubscriptionOrderResponse;
  if (!res.ok) {
    throw new Error(data.error ?? "Could not create payment order");
  }
  return data;
}

export async function verifySubscriptionPayment(
  storeId: number,
  token: string,
  body: {
    planId: number;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const res = await authFetch(
    `${base()}/v1/merchant-partner/stores/${storeId}/subscription/verify-payment`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Payment verification failed");
  }
  return { success: true };
}

export async function upgradeSubscription(
  storeId: number,
  token: string,
  body: {
    newPlanId: number;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    skipPayment?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const res = await authFetch(
    `${base()}/v1/merchant-partner/stores/${storeId}/subscription/upgrade`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Upgrade failed");
  }
  return { success: true };
}

export type PayWithWalletResponse = {
  success: boolean;
  subscriptionId?: number;
  ledgerId?: number;
  isUpgrade?: boolean;
  creditApplied?: number;
  idempotent?: boolean;
  message?: string;
  /** Set to "wallet_insufficient" when the AVAILABLE balance is short. */
  error?: string;
  required?: number;
  available?: number;
};

/**
 * Pay for a plan using the merchant's wallet AVAILABLE balance. Returns 402
 * with error="wallet_insufficient" (plus required/available amounts) when the
 * merchant does not have enough to cover the plan price. Idempotent — safe to
 * retry on network failure or double-click.
 */
export async function payMerchantSubscriptionWithWallet(
  storeId: number,
  token: string,
  planId: number
): Promise<PayWithWalletResponse> {
  const res = await authFetch(
    `${base()}/v1/merchant-partner/stores/${storeId}/subscription/pay-with-wallet`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ planId }),
    }
  );
  const data = (await res.json()) as PayWithWalletResponse;
  if (!res.ok) {
    // 402 wallet_insufficient is a "structured error" — preserve fields so the
    // UI can render the exact shortfall instead of a generic message.
    return {
      success: false,
      error: data.error ?? "Payment failed",
      required: data.required,
      available: data.available,
    };
  }
  return data;
}

export async function activateFreeSubscription(
  storeId: number,
  token: string,
  planId: number
): Promise<void> {
  const res = await authFetch(
    `${base()}/v1/merchant-partner/stores/${storeId}/subscription/activate-free`,
    token,
    { method: "POST", body: JSON.stringify({ planId }) }
  );
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Could not activate free plan");
  }
}

export type MerchantSubscriptionDetails = {
  success: boolean;
  active: boolean;
  subscription: {
    id: number;
    autoRenew: boolean;
    subscriptionStatus: string;
    paymentStatus: string;
    startDate: string | null;
    expiryDate: string | null;
    nextBillingDate: string | null;
    lastPaymentDate: string | null;
  } | null;
  plan: {
    id: number;
    planName: string;
    planCode: string;
    price: number;
    gstPercent: number;
    billingCycle: string;
  } | null;
  error?: string;
};

export async function fetchMerchantSubscriptionDetails(
  storeId: number,
  token: string
): Promise<MerchantSubscriptionDetails> {
  const res = await authFetch(
    `${base()}/v1/merchant-partner/stores/${storeId}/subscription`,
    token,
    { method: "GET" }
  );
  const data = (await res.json()) as MerchantSubscriptionDetails;
  if (!res.ok) {
    throw new Error(data.error ?? "Could not load subscription");
  }
  return data;
}

export type MerchantRefundHistoryEntry = {
  id: number;
  paymentId: number;
  subscriptionId: number;
  storeId: number;
  storeName: string | null;
  planId: number | null;
  planName: string | null;
  planCode: string | null;
  gateway: "WALLET" | "RAZORPAY";
  amount: number;
  totalPaise: number;
  currency: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  reason: string;
  initiatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  // NOTE: no `actor` field — merchant-facing endpoint intentionally strips
  // agent identity. See backend listMerchantSubscriptionRefunds(includeActor).
};

export async function fetchMerchantSubscriptionRefunds(
  storeId: number,
  token: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<{
  items: MerchantRefundHistoryEntry[];
  total: number;
  hasMore: boolean;
}> {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  if (opts.offset != null) qs.set("offset", String(opts.offset));
  const url =
    `${base()}/v1/merchant-partner/stores/${storeId}/subscription/refunds` +
    (qs.toString() ? `?${qs.toString()}` : "");
  const res = await authFetch(url, token, { method: "GET" });
  const data = (await res.json()) as {
    success?: boolean;
    items?: MerchantRefundHistoryEntry[];
    total?: number;
    hasMore?: boolean;
    error?: string;
  };
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Could not load refund history");
  }
  return {
    items: data.items ?? [],
    total: data.total ?? 0,
    hasMore: Boolean(data.hasMore),
  };
}

export async function updateSubscriptionAutoRenew(
  storeId: number,
  token: string,
  autoRenew: boolean
): Promise<{ success: boolean; autoRenew?: boolean; nextBillingDate?: string | null; error?: string }> {
  const res = await authFetch(
    `${base()}/v1/merchant-partner/stores/${storeId}/subscription/auto-renew`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ autoRenew }),
    }
  );
  const data = (await res.json()) as {
    success?: boolean;
    autoRenew?: boolean;
    nextBillingDate?: string | null;
    error?: string;
  };
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Failed to update auto-renew");
  }
  return { success: true, autoRenew: data.autoRenew, nextBillingDate: data.nextBillingDate };
}

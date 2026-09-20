/**
 * Merchant outstanding-dues clear via Razorpay (Partner Site parity).
 */
import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

function base() {
  return getConfig().apiBaseUrl.replace(/\/+$/, "");
}

export type CreateDuesPaymentOrderResponse = {
  success: boolean;
  orderId?: string;
  keyId?: string;
  amount?: number;
  currency?: string;
  duesAmount?: number;
  availableBalance?: number;
  description?: string;
  error?: string;
};

export type VerifyDuesPaymentResponse = {
  success: boolean;
  paidAmount?: number;
  availableBalance?: number;
  duesRemaining?: number;
  ledgerId?: number | null;
  description?: string;
  idempotent?: boolean;
  alreadyCleared?: boolean;
  error?: string;
};

export async function createDuesPaymentOrder(
  storeId: number,
  token: string,
): Promise<CreateDuesPaymentOrderResponse> {
  const res = await authFetch(
    `${base()}/v1/merchant-partner/stores/${storeId}/wallet/dues/create-payment-order`,
    token,
    { method: "POST", body: JSON.stringify({}) },
  );
  const data = (await res.json()) as CreateDuesPaymentOrderResponse;
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Could not create dues payment order");
  }
  return data;
}

export async function verifyDuesPayment(
  storeId: number,
  token: string,
  body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
): Promise<VerifyDuesPaymentResponse> {
  const res = await authFetch(
    `${base()}/v1/merchant-partner/stores/${storeId}/wallet/dues/verify-payment`,
    token,
    { method: "POST", body: JSON.stringify(body) },
  );
  const data = (await res.json()) as VerifyDuesPaymentResponse;
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Dues payment verification failed");
  }
  return data;
}

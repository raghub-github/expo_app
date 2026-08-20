/**
 * Payment service – Razorpay order creation for checkout.
 */

import api from "./api";
import { getConfig } from "@/config/env";
import { ORDER_PLACEMENT_TIMEOUT_MS } from "@/constants";
import { isRetriableCheckoutError } from "@/utils/networkError";
import type { CheckoutPayMethodsResponse } from "@/lib/razorpayPaymentMethods";

const PAYMENT_PREFIX = "/v1/payment";

export type CreateRazorpayOrderResponse = {
  orderId: string;
  keyId: string;
  amount: number;
  currency: string;
};

export const paymentService = {
  /**
   * Create a Razorpay order (amount in paise). Returns orderId and keyId for opening checkout.
   *
   * When the backend has PAYMENT_DUMMY_MODE=true (or no Razorpay creds in dev),
   * the response carries `keyId === "dummy_key"` and the checkout screen renders
   * the dummy payment sheet instead of opening Razorpay.
   */
  async createRazorpayOrder(params: {
    amountPaise: number;
    currency?: string;
    receipt?: string;
    pendingId?: string;
  }): Promise<CreateRazorpayOrderResponse> {
    const { data } = await api.post<CreateRazorpayOrderResponse>(
      `${PAYMENT_PREFIX}/create-order`,
      {
        amount: params.amountPaise,
        currency: params.currency ?? "INR",
        receipt: params.receipt,
        pendingId: params.pendingId,
      },
      { timeout: ORDER_PLACEMENT_TIMEOUT_MS }
    );
    return data;
  },

  /** Razorpay order with retries when LAN to dev backend is flaky. */
  async createRazorpayOrderWithRetry(
    params: {
      amountPaise: number;
      currency?: string;
      receipt?: string;
      pendingId?: string;
    },
    opts: { retries?: number; delayMs?: number } = {}
  ): Promise<CreateRazorpayOrderResponse> {
    const { retries = 2, delayMs = 1200 } = opts;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.createRazorpayOrder(params);
      } catch (e) {
        lastErr = e;
        if (!isRetriableCheckoutError(e) || attempt === retries) throw e;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  },

  /**
   * Dummy payment failure — called from the dummy payment sheet's "Simulate Failure"
   * button. Marks the pending order as FAILED via the same backend logic that
   * handles a real Razorpay payment.failed webhook, so the order is properly
   * cleaned up (cart can be retried, no ghost pending row, audit logged).
   */
  async markDummyPaymentFailed(params: {
    pendingId: string;
    razorpayOrderId: string;
    reason?: string;
  }): Promise<{ ok: boolean }> {
    const { data } = await api.post<{ ok: boolean }>(`${PAYMENT_PREFIX}/dummy/fail`, {
      pendingId: params.pendingId,
      razorpayOrderId: params.razorpayOrderId,
      reason: params.reason,
    });
    return data;
  },

  /**
   * Build the Razorpay checkout page URL (opens in WebView). Amount is already in the Razorpay order.
   */
  getCheckoutPageUrl(params: {
    orderId: string;
    keyId: string;
    amount: number; // paise (from create-order response)
    successUrl?: string;
    cancelUrl?: string;
  }): string {
    const { apiBaseUrl } = getConfig();
    const base = apiBaseUrl.replace(/\/+$/, "");
    const success = params.successUrl ?? "gatimitra://pay-success";
    const cancel = params.cancelUrl ?? "gatimitra://pay-cancel";
    const q = new URLSearchParams({
      order_id: params.orderId,
      key_id: params.keyId,
      amount: String(params.amount),
      success_url: success,
      cancel_url: cancel,
    });
    return `${base}/v1/razorpay-checkout?${q.toString()}`;
  },

  /**
   * Enabled Razorpay methods for this account (UPI apps, cards, wallets),
   * mapped by the backend from GET https://api.razorpay.com/v1/methods.
   */
  async getAvailableMethods(): Promise<CheckoutPayMethodsResponse> {
    const { data } = await api.get<CheckoutPayMethodsResponse>(`${PAYMENT_PREFIX}/methods`);
    return data;
  },

  /**
   * Server-to-server UPI Intent URL for the given Razorpay order.
   * Open the returned `intentUrl` with Linking (upi:// / phonepe://) — this is
   * the path that actually launches PhonePe / GPay from Expo Go.
   */
  async createUpiIntent(params: {
    orderId: string;
    amountPaise: number;
    contact: string;
    email?: string;
    pendingId?: string;
  }): Promise<{ intentUrl: string | null; paymentId: string | null }> {
    const { data } = await api.post<{ intentUrl: string | null; paymentId: string | null }>(
      `${PAYMENT_PREFIX}/upi-intent`,
      params,
      { timeout: ORDER_PLACEMENT_TIMEOUT_MS, headers: { "X-Silent-Error": "1" } }
    );
    return data;
  },
};

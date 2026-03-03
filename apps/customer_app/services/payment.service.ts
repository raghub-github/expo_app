/**
 * Payment service – Razorpay order creation for checkout.
 */

import api from "./api";
import { getConfig } from "@/config/env";

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
   */
  async createRazorpayOrder(params: {
    amountPaise: number;
    currency?: string;
    receipt?: string;
  }): Promise<CreateRazorpayOrderResponse> {
    const { data } = await api.post<CreateRazorpayOrderResponse>(`${PAYMENT_PREFIX}/create-order`, {
      amount: params.amountPaise,
      currency: params.currency ?? "INR",
      receipt: params.receipt,
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
};

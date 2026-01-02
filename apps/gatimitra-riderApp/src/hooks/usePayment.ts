import { useMutation } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { postJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export interface CreatePaymentOrderRequest {
  riderId: string;
}

export interface CreatePaymentOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  key: string;
}

export interface VerifyPaymentRequest {
  riderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  paymentId: string;
}

/**
 * Create Razorpay payment order
 */
export function useCreatePaymentOrder() {
  const session = useSessionStore((s) => s.session);

  return useMutation({
    mutationFn: async (data: CreatePaymentOrderRequest): Promise<CreatePaymentOrderResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }

      return postJson<CreatePaymentOrderResponse>(
        `${API_BASE()}/v1/payment/onboarding/create-order`,
        data,
        { Authorization: `Bearer ${session.accessToken}` }
      );
    },
  });
}

/**
 * Verify Razorpay payment
 */
export function useVerifyPayment() {
  const session = useSessionStore((s) => s.session);

  return useMutation({
    mutationFn: async (data: VerifyPaymentRequest): Promise<VerifyPaymentResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }

      return postJson<VerifyPaymentResponse>(
        `${API_BASE()}/v1/payment/onboarding/verify`,
        data,
        { Authorization: `Bearer ${session.accessToken}` }
      );
    },
  });
}


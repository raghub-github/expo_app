import { useMutation } from "@tanstack/react-query";
import { getRiderAppConfig } from "@/src/config/env";
import { postJson } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export type RiderPenaltyPaymentOrder = {
  success: boolean;
  orderId: string;
  keyId: string;
  amount: number;
  amountRupees?: number;
  currency: string;
  dummyMode?: boolean;
};

export function useRiderPenaltyPayment() {
  const session = useSessionStore((s) => s.session);

  const createOrder = useMutation({
    mutationFn: async (): Promise<RiderPenaltyPaymentOrder> => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<RiderPenaltyPaymentOrder>(
        `${API_BASE()}/v1/rider/penalty/create-payment-order`,
        {},
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });

  const verifyPayment = useMutation({
    mutationFn: async (payload: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }) => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<{
        success: boolean;
        creditedAmount: number;
        totalBalance: number;
        idempotent?: boolean;
      }>(`${API_BASE()}/v1/rider/penalty/verify-payment`, payload, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
    },
  });

  return { createOrder, verifyPayment };
}

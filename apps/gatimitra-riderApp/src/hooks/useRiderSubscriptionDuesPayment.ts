import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRiderAppConfig } from "@/src/config/env";
import { RIDER_DUTY_STATUS_QUERY_KEY } from "@/src/hooks/useDutyStatus";
import { postJson } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export type RiderSubscriptionDuesPaymentOrder = {
  success: boolean;
  orderId: string;
  keyId: string;
  amount: number;
  amountRupees?: number;
  currency: string;
  dummyMode?: boolean;
  totalDue?: number;
};

function useInvalidateAfterSubscriptionDuesPayment() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["rider", "subscription"] });
    void queryClient.invalidateQueries({ queryKey: ["rider", "ledger"] });
    void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
    void queryClient.invalidateQueries({ queryKey: ["rider", "earnings", "summary"] });
    void queryClient.invalidateQueries({ queryKey: RIDER_DUTY_STATUS_QUERY_KEY });
  };
}

export function useRiderSubscriptionDuesPayment() {
  const session = useSessionStore((s) => s.session);
  const invalidate = useInvalidateAfterSubscriptionDuesPayment();

  const createOrder = useMutation({
    mutationFn: async (): Promise<RiderSubscriptionDuesPaymentOrder> => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<RiderSubscriptionDuesPaymentOrder>(
        `${API_BASE()}/v1/rider/subscription/dues/create-payment-order`,
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
        paidAmount: number;
        totalDueBefore: number;
        totalDueAfter: number;
        totalBalance: number;
        idempotent?: boolean;
      }>(`${API_BASE()}/v1/rider/subscription/dues/verify-payment`, payload, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
    },
    onSuccess: invalidate,
  });

  return { createOrder, verifyPayment };
}

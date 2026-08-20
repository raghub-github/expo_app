import { useMutation, useQuery } from "@tanstack/react-query";
import { getRiderAppConfig } from "@/src/config/env";
import { postJson, getJson } from "@/src/services/http";
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

export type RiderWalletPaymentHistoryItem = {
  id: number;
  purpose: string;
  amountPaise: number;
  walletBefore: number | null;
  walletAfter: number | null;
  status: string;
  gateway: string;
  method: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  refundStatus: string | null;
  refundAmountPaise: number | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
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
        reactivatedServices?: string[];
        idempotent?: boolean;
      }>(`${API_BASE()}/v1/rider/penalty/verify-payment`, payload, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
    },
  });

  /**
   * Ask the backend to reconcile any pending/delayed Razorpay payment against the
   * gateway (settles a captured-but-unconfirmed one, fails an abandoned one). Safe
   * to call on refresh/foreground — idempotent and a no-op when nothing is pending.
   */
  const reconcile = useMutation({
    mutationFn: async () => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<{ success: boolean; reconciled: number; settled: number }>(
        `${API_BASE()}/v1/rider/penalty/reconcile`,
        {},
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });

  /** Record a cancelled / failed native-sheet attempt (fire-and-forget). */
  const recordAttempt = useMutation({
    mutationFn: async (payload: {
      razorpayOrderId: string;
      status: "failed" | "cancelled";
      reason?: string;
    }) => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<{ success: boolean }>(
        `${API_BASE()}/v1/rider/penalty/attempt`,
        payload,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });

  return { createOrder, verifyPayment, recordAttempt, reconcile };
}

/** Rider's own wallet-payment history (all statuses). */
export function useRiderWalletPaymentHistory() {
  const session = useSessionStore((s) => s.session);
  return useQuery({
    queryKey: ["rider", "wallet", "payment-history"],
    queryFn: async (): Promise<RiderWalletPaymentHistoryItem[]> => {
      const res = await getJson<{ success: boolean; payments: RiderWalletPaymentHistoryItem[] }>(
        `${API_BASE()}/v1/rider/penalty/history`,
        { headers: { authorization: `Bearer ${session!.accessToken}` } }
      );
      return res.payments ?? [];
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 60_000,
  });
}

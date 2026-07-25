import { useMutation, useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { postJson, getJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export interface CreatePaymentOrderRequest {
  riderId: string;
}

export interface CreatePaymentOrderResponse {
  orderId: string;
  amount: number;
  subtotalPaise?: number;
  gstAmountPaise?: number;
  gstPercentApplied?: number;
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
        { headers: { authorization: `Bearer ${session.accessToken}` } }
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
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });
}

export interface RecordPaymentAttemptRequest {
  riderId: string;
  razorpayOrderId: string;
  status: "failed";
  reason?: string;
}

/**
 * Record an abandoned/failed onboarding payment attempt so the full lifecycle
 * (initiate → attempt → success/refund) is auditable server-side. Fire-and-forget
 * from the UI — the backend marks the pending row failed and appends a
 * payment_events entry.
 */
export function useRecordPaymentAttempt() {
  const session = useSessionStore((s) => s.session);

  return useMutation({
    mutationFn: async (data: RecordPaymentAttemptRequest): Promise<{ ok: boolean }> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }

      return postJson<{ ok: boolean }>(
        `${API_BASE()}/v1/payment/onboarding/attempt`,
        data,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });
}

export interface OnboardingPaymentRefund {
  status: string | null;
  refundId: string | null;
  amountPaise: number | null;
  partial: boolean;
  at: string | null;
}

export interface OnboardingPaymentDetails {
  hasPayment: boolean;
  status?: string;
  provider?: string;
  refId?: string;
  amountPaise?: number;
  subtotalPaise?: number | null;
  gstAmountPaise?: number | null;
  gstPercentApplied?: number | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  paidAt?: string | null;
  refund?: OnboardingPaymentRefund | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Onboarding payment details for the rider profile "Payment details" page.
 * Reflects the latest onboarding payment with breakdown + refund status.
 */
export function useOnboardingPaymentDetails(riderId?: string | null) {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "onboarding", "payment-details", riderId ?? ""],
    queryFn: async (): Promise<OnboardingPaymentDetails> => {
      return getJson<OnboardingPaymentDetails>(
        `${API_BASE()}/v1/payment/onboarding/${riderId}/details`,
        { headers: { authorization: `Bearer ${session!.accessToken}` } }
      );
    },
    enabled: Boolean(session?.accessToken && riderId),
    staleTime: 60_000,
  });
}


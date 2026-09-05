import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { riderApi } from "@/src/services/api/riderApi";
import { isUnauthorizedError } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  filterCancelReasonsForService,
  mapVariantToServiceType,
  RIDER_CANCEL_REASON_FALLBACK,
  type RiderCancelReasonItem,
} from "@/src/lib/rider-ride-cancel-reasons";

export const RIDER_CANCEL_REASONS_QUERY_KEY = ["rider", "cancellationReasons"] as const;

function cancellationReasonsQueryKey(serviceType: string) {
  return [...RIDER_CANCEL_REASONS_QUERY_KEY, serviceType] as const;
}

export function cancellationPenaltyPreviewQueryKey(
  orderId: string,
  reasonCode: string
) {
  return ["rider", "cancellationPenaltyPreview", orderId, reasonCode] as const;
}

async function fetchCancellationReasons(
  serviceType: ReturnType<typeof mapVariantToServiceType>
): Promise<RiderCancelReasonItem[]> {
  try {
    const res = await riderApi.getCancellationReasons(serviceType);
    const list = filterCancelReasonsForService(res.reasons ?? [], serviceType);
    if (list.length === 0) return RIDER_CANCEL_REASON_FALLBACK;
    return list.map((r) => ({
      id: r.id,
      reasonCode: r.reasonCode,
      label: r.label,
      serviceType: r.serviceType ?? null,
      sortOrder: r.sortOrder,
    }));
  } catch {
    return RIDER_CANCEL_REASON_FALLBACK;
  }
}

/**
 * Warm cancel-reason catalog as soon as the rider is on an active order screen —
 * never wait until the cancel sheet opens.
 */
export function useRiderCancellationReasons(
  variant: "ride" | "food" | "parcel",
  _visible = true
) {
  const hasSession = useSessionStore((s) => !!s.session?.accessToken);
  const serviceType = mapVariantToServiceType(variant);

  return useQuery({
    queryKey: cancellationReasonsQueryKey(serviceType),
    queryFn: () => fetchCancellationReasons(serviceType),
    enabled: hasSession,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    placeholderData: RIDER_CANCEL_REASON_FALLBACK,
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error)) return false;
      return failureCount < 1;
    },
  });
}

export type RiderCancellationPenaltyPreview = {
  appliesPenalty: boolean;
  penaltyAmount: number;
  ledgerTitle: string;
  ledgerDescription: string;
  reasonLabel: string | null;
  scenarioCode?: string | null;
  skipped?: string;
};

const EMPTY_PREVIEW: RiderCancellationPenaltyPreview = {
  appliesPenalty: false,
  penaltyAmount: 0,
  ledgerTitle: "",
  ledgerDescription: "",
  reasonLabel: null,
};

async function fetchPenaltyPreview(
  orderId: string,
  reasonCode: string
): Promise<RiderCancellationPenaltyPreview> {
  try {
    return await riderApi.getCancellationPenaltyPreview(orderId, reasonCode);
  } catch {
    return { ...EMPTY_PREVIEW, skipped: "preview_failed" };
  }
}

/** Prefetch penalty for every cancel reason so confirm sheet paints instantly. */
export async function prefetchRiderCancellationPenaltyPreviews(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId: string,
  reasons: RiderCancelReasonItem[]
): Promise<void> {
  await Promise.all(
    reasons.map((r) =>
      queryClient.prefetchQuery({
        queryKey: cancellationPenaltyPreviewQueryKey(orderId, r.reasonCode),
        queryFn: () => fetchPenaltyPreview(orderId, r.reasonCode),
        staleTime: 60_000,
      })
    )
  );
}

/**
 * When `prefetch` is true, keep the query warm even if the confirm sheet is closed.
 */
export function useRiderCancellationPenaltyPreview(
  orderId: string | null | undefined,
  reasonCode: string | null | undefined,
  visible: boolean,
  opts?: { prefetch?: boolean }
) {
  const hasSession = useSessionStore((s) => !!s.session?.accessToken);
  const warm = Boolean(opts?.prefetch);

  return useQuery({
    queryKey: cancellationPenaltyPreviewQueryKey(
      orderId ?? "",
      reasonCode ?? ""
    ),
    queryFn: async (): Promise<RiderCancellationPenaltyPreview> => {
      if (!orderId || !reasonCode) return EMPTY_PREVIEW;
      return fetchPenaltyPreview(orderId, reasonCode);
    },
    enabled:
      hasSession &&
      Boolean(orderId && reasonCode) &&
      (visible || warm),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

/** Prefetch all reason→penalty pairs while the reason sheet is open. */
export function usePrefetchCancelPenaltyPreviews(
  orderId: string | null | undefined,
  reasons: RiderCancelReasonItem[] | undefined,
  active: boolean
) {
  const queryClient = useQueryClient();
  const hasSession = useSessionStore((s) => !!s.session?.accessToken);

  useEffect(() => {
    if (!active || !hasSession || !orderId || !reasons?.length) return;
    void prefetchRiderCancellationPenaltyPreviews(queryClient, orderId, reasons);
  }, [active, hasSession, orderId, reasons, queryClient]);
}

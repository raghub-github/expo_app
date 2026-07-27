import { useQuery } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";
import { isUnauthorizedError } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  filterCancelReasonsForService,
  mapVariantToServiceType,
  RIDER_CANCEL_REASON_FALLBACK,
  type RiderCancelReasonItem,
} from "@/src/lib/rider-ride-cancel-reasons";

export function useRiderCancellationReasons(
  variant: "ride" | "food" | "parcel",
  visible = true
) {
  const hasSession = useSessionStore((s) => !!s.session?.accessToken);
  const serviceType = mapVariantToServiceType(variant);

  return useQuery({
    queryKey: ["rider", "cancellationReasons", serviceType],
    queryFn: async (): Promise<RiderCancelReasonItem[]> => {
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
        // Network / schema failures — still show universal offline list.
        return RIDER_CANCEL_REASON_FALLBACK;
      }
    },
    enabled: hasSession && visible,
    staleTime: 10 * 60_000,
    // placeholderData only — initialData + staleTime blocked the real catalog fetch.
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

export function useRiderCancellationPenaltyPreview(
  orderId: string | null | undefined,
  reasonCode: string | null | undefined,
  visible: boolean
) {
  const hasSession = useSessionStore((s) => !!s.session?.accessToken);

  return useQuery({
    queryKey: ["rider", "cancellationPenaltyPreview", orderId, reasonCode],
    queryFn: async (): Promise<RiderCancellationPenaltyPreview> => {
      if (!orderId || !reasonCode) {
        return {
          appliesPenalty: false,
          penaltyAmount: 0,
          ledgerTitle: "",
          ledgerDescription: "",
          reasonLabel: null,
        };
      }
      try {
        return await riderApi.getCancellationPenaltyPreview(orderId, reasonCode);
      } catch {
        return {
          appliesPenalty: false,
          penaltyAmount: 0,
          ledgerTitle: "",
          ledgerDescription: "",
          reasonLabel: null,
          skipped: "preview_failed",
        };
      }
    },
    enabled: hasSession && visible && Boolean(orderId && reasonCode),
    staleTime: 0,
    retry: 1,
  });
}

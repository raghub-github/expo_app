"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OrderPaymentDetail } from "@/lib/orders/order-payment-types";
import {
  fetchOrderCorePayload,
  invalidateOrderDetailQuery,
  orderDetailQueryKey,
  refetchOrderDetailFresh,
  useOrderDetailQuery,
} from "@/hooks/queries/useOrderDetailQuery";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/context/ToastContext";
import { useAuthOptional } from "@/providers/AuthProvider";
import { OrderNotFoundState } from "@/components/orders/OrderNotFoundState";
import RiderRouteMap from "../RiderRouteMap";
import RiderDetails, { type ForceAssignmentLiveState } from "../RiderDetails";
import OrderTimeline, { type OrderTimelineEntry } from "../OrderTimeline";
import PaymentDetails from "../PaymentDetails";
import {
  OrderCustomerFeedbackSideSheet,
  type FeedbackSheetTarget,
} from "../OrderCustomerFeedbackSideSheet";
import PersonRideRefundModal from "./PersonRideRefundModal";
import {
  mapCoreRowToPersonRideDetail,
  type PersonRideDetailOrder,
} from "./person-ride-detail-types";
import PersonRideOrderHeader, {
  type PersonRideStatusHistoryEntry,
  type PersonRideTicketSummary,
} from "./PersonRideOrderHeader";
import {
  DropCard,
  PassengerCard,
  PickupCard,
  type CaptainInfo,
  type RideRatings,
  type TimelineStamp,
} from "./PersonRideDetailSections";
import PersonRideRightSidebar from "./PersonRideRightSidebar";
import { PR_MUTED, PR_WHITE, normalizeStatus } from "./person-ride-utils";
import { buildRideInvoiceLinesFromSnapshot } from "@/lib/orders/ride-invoice-lines";
import { isRideFarePaymentPending } from "@/lib/riders/ride-wallet-credit-pending";
import { readCustomerOrderStats } from "@/lib/orders/customer-order-stats";
import { formatDeliveredByLabel } from "@/lib/orders/order-detail-display";
import {
  MANUAL_STATUS_LABELS,
  type ManualStatusValue,
} from "@/lib/orders/order-dispatch-status";
import OrderNthUserBanner from "../OrderNthUserBanner";

type OrderRefundListItem = {
  id: number;
  refundAmount: string;
  refundStatus: string | null;
  refundType?: string | null;
  refundReason?: string | null;
  executionStatus?: string | null;
  razorpayRefundId?: string | null;
  pgRefundId?: string | null;
  customerWalletLedgerId?: number | null;
  createdAt?: string | Date | null;
  initiatedByEmail?: string | null;
};

type TimelineEntryFromApi = Omit<OrderTimelineEntry, "occurredAt" | "expectedByAt"> & {
  occurredAt?: unknown;
  expectedByAt?: unknown;
  stageKey?: string | null;
  stage_key?: string | null;
  occurred_at?: string | null;
  createdAt?: string | null;
  timestamp?: string | null;
};

type CoreResponse = {
  success?: boolean;
  data?: unknown[];
  error?: string;
  paymentDetail?: OrderPaymentDetail;
  timeline?: TimelineEntryFromApi[];
  statusHistory?: unknown[];
  riderDispatchUi?: {
    dispatchSessionActive?: boolean;
    riderId?: number | null;
    riderName?: string | null;
    riderMobile?: string | null;
  } | null;
  routedToHistory?: Array<{
    actorEmail?: string | null;
    actorName?: string | null;
  }>;
};

function parseStatusHistoryEntry(raw: unknown): PersonRideStatusHistoryEntry | null {
  if (raw == null || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;
  if (typeof h.toStatus !== "string" || typeof h.updatedByEmail !== "string") return null;
  return {
    toStatus: h.toStatus,
    updatedByEmail: h.updatedByEmail,
    updatedByRole:
      typeof h.updatedByRole === "string" && h.updatedByRole.trim()
        ? h.updatedByRole.trim()
        : "AGENT",
    createdAt: typeof h.createdAt === "string" ? h.createdAt : String(h.createdAt ?? ""),
  };
}

function normalizeTimelineAt(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function normalizeTimelineAtNullable(value: unknown): string | null {
  if (value == null) return null;
  return normalizeTimelineAt(value);
}

function mapTimelineEntries(raw: TimelineEntryFromApi[]): OrderTimelineEntry[] {
  return raw.map((e, index) => ({
    id: typeof e.id === "number" ? e.id : -(index + 1),
    orderId: typeof e.orderId === "number" ? e.orderId : 0,
    status: String(e.status ?? e.stageKey ?? e.stage_key ?? "").trim() || "Created",
    previousStatus: e.previousStatus != null ? String(e.previousStatus) : null,
    actorType: String(e.actorType ?? "system"),
    actorId: typeof e.actorId === "number" ? e.actorId : null,
    actorName: e.actorName != null ? String(e.actorName) : null,
    statusMessage: e.statusMessage != null ? String(e.statusMessage) : null,
    occurredAt: normalizeTimelineAt(
      e.occurredAt ?? e.occurred_at ?? e.createdAt ?? e.timestamp
    ),
    expectedByAt: normalizeTimelineAtNullable(e.expectedByAt),
  }));
}

function routedToLabelFrom(
  name: string | null | undefined,
  email: string | null | undefined
): string | null {
  const n = (name ?? "").trim();
  if (n) return n;
  const e = (email ?? "").trim();
  return e || null;
}

function extractStamps(
  timeline: CoreResponse["timeline"],
  order: PersonRideDetailOrder
): TimelineStamp[] {
  const stamps: TimelineStamp[] = [{ stageKey: "booked", at: order.createdAt }];
  if (!Array.isArray(timeline)) return stamps;

  const statusToKey: Record<string, string> = {
    created: "booked",
    pending: "booked",
    confirmed: "booked",
    placed: "booked",
    searching_rider: "booked",
    assigned: "assigned",
    rider_assigned: "assigned",
    "rider assigned": "assigned",
    accepted: "on_the_way",
    rider_on_the_way: "on_the_way",
    reached_store: "arrived",
    rider_waiting_for_otp: "arrived",
    rider_at_pickup: "arrived",
    rider_reached_pickup: "arrived",
    "rider reached pickup": "arrived",
    pickup_otp_verified: "arrived",
    picked_up: "trip_started",
    ride_in_progress: "trip_started",
    in_transit: "near_destination",
    near_drop: "near_destination",
    arrived_at_drop: "near_destination",
    delivered: "completed",
    completed: "completed",
    cancelled: "cancelled",
    canceled: "cancelled",
  };

  for (const entry of timeline) {
    const raw = entry.stageKey || entry.stage_key || entry.status || "";
    const key = String(raw)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const spaced = String(raw).trim().toLowerCase().replace(/_/g, " ");
    const mapped = statusToKey[key] || statusToKey[spaced] || key;
    const at =
      entry.occurredAt ||
      entry.occurred_at ||
      entry.createdAt ||
      entry.timestamp ||
      null;
    if (mapped && at) {
      stamps.push({ stageKey: mapped, at: String(at) });
    }
  }
  return stamps;
}

function InfinitySpinner() {
  return (
    <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-3">
      <svg width="96" height="48" viewBox="0 0 96 48" fill="none" aria-hidden className="shrink-0">
        <path
          d="M12 24C12 17.3726 17.3726 12 24 12C32 12 36.5 17 48 24C59.5 31 64 36 72 36C78.6274 36 84 30.6274 84 24C84 17.3726 78.6274 12 72 12C64 12 59.5 17 48 24C36.5 31 32 36 24 36C17.3726 36 12 30.6274 12 24Z"
          stroke="#e5e5e5"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 24C12 17.3726 17.3726 12 24 12C32 12 36.5 17 48 24C59.5 31 64 36 72 36C78.6274 36 84 30.6274 84 24C84 17.3726 78.6274 12 72 12C64 12 59.5 17 48 24C36.5 31 32 36 24 36C17.3726 36 12 30.6274 12 24Z"
          stroke="#16A34A"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="60 160"
        >
          <animate attributeName="stroke-dashoffset" values="0;220" dur="1.2s" repeatCount="indefinite" />
        </path>
      </svg>
      <p className="pr-body text-[13px]" style={{ color: PR_MUTED }}>
        Loading ride details…
      </p>
    </div>
  );
}

export default function PersonRideOrderDetailClient({
  orderPublicId,
  onLoadingChange,
  onNotFoundChange,
}: {
  orderPublicId: string;
  onLoadingChange?: (loading: boolean) => void;
  onNotFoundChange?: (notFound: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const auth = useAuthOptional();
  const loggedInEmail = auth?.user?.email?.trim() || null;
  const normalizedId = orderPublicId.trim().replace(/^#/, "");
  const cachedQuery = useOrderDetailQuery(normalizedId);

  const [order, setOrder] = useState<PersonRideDetailOrder | null>(null);
  const [paymentDetail, setPaymentDetail] = useState<OrderPaymentDetail | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<OrderTimelineEntry[] | null>(null);
  const [stamps, setStamps] = useState<TimelineStamp[]>([]);
  const [statusHistory, setStatusHistory] = useState<PersonRideStatusHistoryEntry[]>([]);
  const [captain, setCaptain] = useState<CaptainInfo | null>(null);
  const [ratings, setRatings] = useState<RideRatings | null>(null);
  const [tickets, setTickets] = useState<PersonRideTicketSummary[]>([]);
  const [orderRefunds, setOrderRefunds] = useState<OrderRefundListItem[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [clearingHold, setClearingHold] = useState(false);
  const [holdCleared, setHoldCleared] = useState(false);
  const [clearHoldModalOpen, setClearHoldModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [routedToLabel, setRoutedToLabel] = useState<string | null>(null);
  const [nthOrdinal, setNthOrdinal] = useState<number | null>(null);
  const [activityLogRefreshKey, setActivityLogRefreshKey] = useState(0);
  const [feedbackSheetTarget, setFeedbackSheetTarget] = useState<FeedbackSheetTarget | null>(
    null
  );
  const [forceAssignment, setForceAssignment] = useState<ForceAssignmentLiveState | null>(null);
  const [watchForceAssignment, setWatchForceAssignment] = useState(false);
  const [dispatchSessionActive, setDispatchSessionActive] = useState(false);
  const [watchRiderAssignment, setWatchRiderAssignment] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  const applyRoutedTo = useCallback((info: { email: string | null; name: string | null }) => {
    const label = routedToLabelFrom(info.name, info.email);
    if (label) setRoutedToLabel(label);
  }, []);

  useEffect(() => {
    onLoadingChange?.(loading && !order);
  }, [loading, order, onLoadingChange]);

  const applyPayload = useCallback(
    (body: CoreResponse) => {
      if (!body.success || !Array.isArray(body.data) || body.data.length === 0) {
        setNotFound(true);
        setOrder(null);
        onNotFoundChange?.(true);
        setNthOrdinal(null);
        setError(body.error || "Ride not found");
        return;
      }
      const row = body.data[0] as Record<string, unknown>;
      const mapped = mapCoreRowToPersonRideDetail(row);
      setOrder(mapped);
      setNthOrdinal(readCustomerOrderStats(row).ordinal);
      setNotFound(false);
      onNotFoundChange?.(false);
      setError(null);
      setPaymentDetail(body.paymentDetail ?? null);
      setStamps(extractStamps(body.timeline, mapped));
      setTimelineEntries(
        Array.isArray(body.timeline) && body.timeline.length > 0
          ? mapTimelineEntries(body.timeline)
          : []
      );
      if (Array.isArray(body.statusHistory)) {
        setStatusHistory(
          body.statusHistory
            .map(parseStatusHistoryEntry)
            .filter((h): h is PersonRideStatusHistoryEntry => h != null)
        );
      } else {
        setStatusHistory([]);
      }
      const dispatchUi = body.riderDispatchUi;
      if (dispatchUi && typeof dispatchUi === "object") {
        setDispatchSessionActive(Boolean(dispatchUi.dispatchSessionActive));
        setWatchRiderAssignment(Boolean(dispatchUi.dispatchSessionActive));
      } else {
        setDispatchSessionActive(false);
      }
      setHoldCleared(Boolean(mapped.rideDetail?.adminRiderPaymentClearedAt?.trim()));
      const latestRouted = Array.isArray(body.routedToHistory) ? body.routedToHistory[0] : null;
      setRoutedToLabel(
        routedToLabelFrom(
          latestRouted?.actorName,
          latestRouted?.actorEmail ?? mapped.routedToEmail
        )
      );
    },
    [onNotFoundChange]
  );

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const loadTickets = useCallback(async (orderId: number) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/tickets`);
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: PersonRideTicketSummary[];
      } | null;
      if (json?.success && Array.isArray(json.data)) {
        setTickets(json.data);
      } else {
        setTickets([]);
      }
    } catch {
      setTickets([]);
    }
  }, []);

  const loadRefunds = useCallback(async (orderId: number) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/refunds`);
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: OrderRefundListItem[];
      } | null;
      setOrderRefunds(json?.success && Array.isArray(json.data) ? json.data : []);
    } catch {
      setOrderRefunds([]);
    }
  }, []);

  const loadWallet = useCallback(async (customerId: number | null) => {
    if (customerId == null || customerId <= 0) {
      setWalletBalance(null);
      return;
    }
    try {
      const res = await fetch(`/api/customers/${customerId}`, { credentials: "include" });
      if (!res.ok) {
        setWalletBalance(null);
        return;
      }
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          walletBalance?: number | string | null;
          wallet?: { availableBalance?: number; currentBalance?: number } | null;
        };
      };
      if (json.success && json.data) {
        const w = json.data.wallet;
        const raw = w?.availableBalance ?? w?.currentBalance ?? json.data.walletBalance;
        setWalletBalance(raw == null ? null : Number(raw));
      } else {
        setWalletBalance(null);
      }
    } catch {
      setWalletBalance(null);
    }
  }, []);

  const loadRatings = useCallback(
    async (orderId: number, riderId: number | null, customerId: number | null) => {
      try {
        const qs = new URLSearchParams();
        if (riderId != null && riderId > 0) qs.set("riderId", String(riderId));
        if (customerId != null && customerId > 0) qs.set("customerId", String(customerId));
        const res = await fetch(`/api/orders/${orderId}/person-ride-ratings?${qs.toString()}`);
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: RideRatings;
        } | null;
        if (json?.success && json.data) {
          setRatings({
            riderAvgRating: json.data.riderAvgRating ?? null,
            orderRiderRating: json.data.orderRiderRating ?? null,
            customerAvgRating: json.data.customerAvgRating ?? null,
          });
        } else {
          setRatings(null);
        }
      } catch {
        setRatings(null);
      }
    },
    []
  );

  const loadCaptain = useCallback(async (riderId: number | null) => {
    if (riderId == null || !Number.isFinite(riderId) || riderId <= 0) {
      setCaptain(null);
      return;
    }
    try {
      const res = await fetch(`/api/riders/${riderId}/summary`);
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: {
          rider?: {
            name?: string | null;
            mobile?: string | null;
            countryCode?: string | null;
            selfieUrl?: string | null;
            onboardingVehicleLabel?: string | null;
            city?: string | null;
            state?: string | null;
            status?: string | null;
            kycStatus?: string | null;
            isOnline?: boolean | null;
          };
          vehicle?: {
            make?: string | null;
            model?: string | null;
            registrationNumber?: string | null;
            onboardingVehicleLabel?: string | null;
            vehicleType?: string | null;
            fuelType?: string | null;
            color?: string | null;
          } | null;
          rating?: number | null;
          avgRating?: number | null;
        };
      } | null;
      if (!json?.success || !json.data) {
        setCaptain(null);
        return;
      }
      const v = json.data.vehicle;
      const r = json.data.rider;
      const vehicleName =
        [v?.make, v?.model].filter(Boolean).join(" ").trim() ||
        v?.onboardingVehicleLabel ||
        r?.onboardingVehicleLabel ||
        v?.vehicleType ||
        null;
      setCaptain({
        name: r?.name ?? null,
        mobile: r?.mobile ?? null,
        countryCode: r?.countryCode ?? "+91",
        selfieUrl: r?.selfieUrl ?? null,
        rating:
          typeof json.data.rating === "number"
            ? json.data.rating
            : typeof json.data.avgRating === "number"
              ? json.data.avgRating
              : null,
        vehicleName,
        vehicleNumber: v?.registrationNumber ?? null,
        vehicleType: v?.vehicleType ?? null,
        fuelType: v?.fuelType ?? null,
        color: v?.color ?? null,
        city: r?.city ?? null,
        state: r?.state ?? null,
        status: r?.status ?? null,
        kycStatus: r?.kycStatus ?? null,
        isOnline: typeof r?.isOnline === "boolean" ? r.isOnline : null,
      });
    } catch {
      setCaptain(null);
    }
  }, []);

  const loadPaymentFallback = useCallback(async (orderId: number) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/payment-detail`);
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: OrderPaymentDetail;
      } | null;
      if (json?.success && json.data) setPaymentDetail(json.data);
    } catch {
      // ignore
    }
  }, []);

  const loadTimelineFallback = useCallback(
    async (orderId: number, mapped: PersonRideDetailOrder) => {
      try {
        const res = await fetch(`/api/orders/${orderId}/timeline`);
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: CoreResponse["timeline"];
        } | null;
        if (json?.success && Array.isArray(json.data)) {
          setStamps(extractStamps(json.data, mapped));
          setTimelineEntries(
            json.data.length > 0 ? mapTimelineEntries(json.data) : []
          );
        }
      } catch {
        // keep booked stamp
      }
    },
    []
  );

  const handleCopy = useCallback(
    async (text: string) => {
      const value = text?.trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        toast("Copied", "success");
      } catch {
        toast("Copy failed", "error");
      }
    },
    [toast]
  );

  const hydrateExtras = useCallback(
    (mapped: PersonRideDetailOrder, body: CoreResponse) => {
      void loadCaptain(mapped.riderId);
      void loadTickets(mapped.id);
      void loadRatings(mapped.id, mapped.riderId, mapped.customerId);
      void loadRefunds(mapped.id);
      void loadWallet(mapped.customerId);
      if (!body.paymentDetail) void loadPaymentFallback(mapped.id);
      if (!body.timeline) void loadTimelineFallback(mapped.id, mapped);
    },
    [
      loadCaptain,
      loadTickets,
      loadRatings,
      loadRefunds,
      loadWallet,
      loadPaymentFallback,
      loadTimelineFallback,
    ]
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const cached = cachedQuery.data as CoreResponse | undefined;
      if (cached?.success && Array.isArray(cached.data) && cached.data.length > 0) {
        applyPayload(cached);
        setLoading(false);
        const mapped = mapCoreRowToPersonRideDetail(cached.data[0] as Record<string, unknown>);
        hydrateExtras(mapped, cached);
        return;
      }
      setLoading(true);
      try {
        const body = (await fetchOrderCorePayload({
          orderPublicId: normalizedId,
        })) as CoreResponse;
        if (cancelled) return;
        applyPayload(body);
        queryClient.setQueryData(orderDetailQueryKey(normalizedId), body);
        if (body.success && Array.isArray(body.data) && body.data[0]) {
          const mapped = mapCoreRowToPersonRideDetail(body.data[0] as Record<string, unknown>);
          hydrateExtras(mapped, body);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load ride");
          setNotFound(true);
          onNotFoundChange?.(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const body = (await refetchOrderDetailFresh(queryClient, normalizedId)) as CoreResponse;
      applyPayload(body);
      await invalidateOrderDetailQuery(queryClient, normalizedId);
      if (body.success && Array.isArray(body.data) && body.data[0]) {
        const mapped = mapCoreRowToPersonRideDetail(body.data[0] as Record<string, unknown>);
        hydrateExtras(mapped, body);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const coreId = order?.id;
    if (coreId == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/orders/${coreId}/force-assignment`, {
          credentials: "include",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          forceAssignment?: ForceAssignmentLiveState | null;
        };
        if (cancelled || !res.ok || !body.success) return;
        const next = body.forceAssignment ?? null;
        if (next?.status === "pending") {
          setForceAssignment({
            status: next.status,
            newRiderId: next.newRiderId,
            newRiderName: next.newRiderName ?? null,
            oldRiderId: next.oldRiderId ?? null,
            oldRiderName: next.oldRiderName ?? null,
            reasonText: next.reasonText ?? "",
            offerExpiresAt: next.offerExpiresAt,
            startedAt: next.startedAt,
          });
          setWatchForceAssignment(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.id]);

  useEffect(() => {
    const coreId = order?.id;
    if (!pageVisible || coreId == null || !order) return;

    const statusUpper = String(order.currentStatus ?? order.status ?? "").toUpperCase();
    const isTerminal =
      statusUpper === "DELIVERED" ||
      ["CANCELLED", "FAILED", "REJECTED", "COMPLETED"].includes(statusUpper);
    const hasRider =
      order.riderId != null &&
      Number.isFinite(Number(order.riderId)) &&
      Number(order.riderId) > 0;
    const shouldPoll =
      !isTerminal && !hasRider && (watchRiderAssignment || dispatchSessionActive);

    if (!shouldPoll) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/${coreId}/rider-assignment-snapshot`, {
          credentials: "include",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          riderId?: number | null;
          riderName?: string | null;
          riderMobile?: string | null;
          dispatchSessionActive?: boolean;
        };
        if (cancelled || !res.ok || !body.success) return;

        setDispatchSessionActive(Boolean(body.dispatchSessionActive));

        setOrder((prev) => {
          if (!prev || prev.id !== coreId) return prev;
          const previousRiderId =
            prev.riderId != null && Number.isFinite(Number(prev.riderId))
              ? Number(prev.riderId)
              : null;
          const nextRiderId =
            body.riderId != null && Number.isFinite(Number(body.riderId))
              ? Number(body.riderId)
              : null;

          if (nextRiderId != null && nextRiderId !== previousRiderId) {
            setWatchRiderAssignment(false);
            setActivityLogRefreshKey((k) => k + 1);
          } else if (!body.dispatchSessionActive && nextRiderId == null) {
            setWatchRiderAssignment(false);
          }

          if (
            previousRiderId === nextRiderId &&
            (prev.riderName ?? null) === (body.riderName ?? null) &&
            (prev.riderMobile ?? null) === (body.riderMobile ?? null)
          ) {
            return prev;
          }

          return {
            ...prev,
            riderId: nextRiderId,
            riderName: body.riderName ?? null,
            riderMobile: body.riderMobile ?? null,
          };
        });
      } catch {
        /* ignore */
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [order, pageVisible, watchRiderAssignment, dispatchSessionActive]);

  useEffect(() => {
    const coreId = order?.id;
    if (!pageVisible || coreId == null) return;
    if (!watchForceAssignment && forceAssignment?.status !== "pending") return;

    let cancelled = false;
    const pollForce = async () => {
      try {
        const res = await fetch(`/api/orders/${coreId}/force-assignment`, {
          credentials: "include",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          forceAssignment?: ForceAssignmentLiveState | null;
        };
        if (cancelled || !res.ok || !body.success) return;

        const next = body.forceAssignment ?? null;
        setForceAssignment(
          next && next.status
            ? {
                status: next.status,
                newRiderId: next.newRiderId,
                newRiderName: next.newRiderName ?? null,
                oldRiderId: next.oldRiderId ?? null,
                oldRiderName: next.oldRiderName ?? null,
                reasonText: next.reasonText ?? "",
                offerExpiresAt: next.offerExpiresAt,
                startedAt: next.startedAt,
              }
            : null
        );

        if (next?.status === "pending") {
          setWatchForceAssignment(true);
          return;
        }

        if (next?.status === "accepted") {
          setWatchForceAssignment(false);
          setActivityLogRefreshKey((k) => k + 1);
          void handleRefresh();
          return;
        }

        if (next && ["rejected", "timeout", "cancelled"].includes(next.status)) {
          setWatchForceAssignment(false);
        }
      } catch {
        /* ignore */
      }
    };

    void pollForce();
    const timer = window.setInterval(() => void pollForce(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, pageVisible, watchForceAssignment, forceAssignment?.status]);

  const handleManualStatusApplied = useCallback(
    async (status: ManualStatusValue) => {
      const label =
        status === "delivered" ? "DELIVERED" : MANUAL_STATUS_LABELS[status];
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status,
              currentStatus: label,
              manualStatusUpdatedByEmail:
                loggedInEmail || prev.manualStatusUpdatedByEmail,
            }
          : prev
      );
      setTimelineEntries((prev) => {
        const newEntry: OrderTimelineEntry = {
          id: -Date.now(),
          orderId: order?.id ?? 0,
          status: label,
          previousStatus: order?.currentStatus ?? order?.status ?? null,
          actorType: "agent",
          actorId: null,
          actorName: loggedInEmail,
          statusMessage: null,
          occurredAt: new Date().toISOString(),
        };
        return [...(prev ?? []), newEntry];
      });
      toast(
        status === "delivered"
          ? "Ride marked complete."
          : `Status updated to ${
              status === "picked_up"
                ? "Trip started"
                : status === "in_transit"
                  ? "In transit"
                  : MANUAL_STATUS_LABELS[status]
            }.`,
        "success"
      );
      setActivityLogRefreshKey((k) => k + 1);
      await handleRefresh();
    },
    [loggedInEmail, order?.id, order?.currentStatus, order?.status, toast]
  );

  const handleClearRiderHold = async () => {
    if (!order?.id || clearingHold) return;
    setClearingHold(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/clear-rider-payment-hold`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        routedToEmail?: string | null;
        routedToName?: string | null;
      };
      if (!res.ok || !json.success) {
        toast(json.error ?? "Could not clear rider payment hold.", "error");
        return;
      }
      setHoldCleared(true);
      setClearHoldModalOpen(false);
      applyRoutedTo({
        email: json.routedToEmail ?? null,
        name: json.routedToName ?? null,
      });
      toast("Rider payment hold cleared. Rider can accept new offers.", "success");
      void handleRefresh();
    } finally {
      setClearingHold(false);
    }
  };

  const orderCancelledOnTimeline = useMemo(() => {
    if (!order) return false;
    return normalizeStatus(order.currentStatus ?? order.status) === "cancelled";
  }, [order]);

  const ridePayableTotal = useMemo(() => {
    if (!order) return 0;
    const { totalFare } = buildRideInvoiceLinesFromSnapshot({
      billingSnapshot: order.billingSnapshot,
      fareAmount: order.itemTotal ?? order.fareAmount,
      tipAmount: order.tipAmount,
      grandTotal:
        paymentDetail?.totalPaid ??
        paymentDetail?.totalAmount ??
        order.grandTotal ??
        order.fareAmount,
      waitingCharges: order.rideDetail?.waitingCharges,
      tollCharges: order.rideDetail?.tollCharges,
      parkingCharges: order.rideDetail?.parkingCharges,
    });
    return totalFare;
  }, [order, paymentDetail]);

  const refundLock = useMemo(() => {
    const grandTotal = Number(ridePayableTotal || order?.grandTotal || order?.fareAmount || 0) || 0;
    const alreadyRefunded = (orderRefunds ?? []).reduce((sum, r) => {
      const status = String(r.refundStatus ?? "").toLowerCase();
      if (status === "failed" || status === "cancelled" || status === "rejected") {
        return sum;
      }
      const amt = Number(r.refundAmount ?? 0);
      return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);
    const remainingRefundable = Math.max(grandTotal - alreadyRefunded, 0);
    const fullyRefunded = grandTotal > 0 && alreadyRefunded >= grandTotal - 0.01;
    const payStatus =
      paymentDetail?.records?.[0]?.paymentStatus ?? order?.paymentStatus ?? null;
    const paymentCaptured = !isRideFarePaymentPending(payStatus);
    const hasPaymentRecord =
      paymentCaptured ||
      (paymentDetail?.records ?? []).some((r) => {
        const s = String(r.paymentStatus ?? "").trim().toUpperCase();
        return (
          s === "PAID" ||
          s === "CAPTURED" ||
          s === "SUCCESS" ||
          s === "COMPLETED" ||
          s === "CAPTURE"
        );
      });
    return {
      fullyRefunded,
      remainingRefundable,
      paymentCaptured: hasPaymentRecord,
      noActionsLeft:
        !hasPaymentRecord || (orderCancelledOnTimeline && fullyRefunded),
      disabledReason: !hasPaymentRecord
        ? "Payment not captured — refund unavailable until fare is paid."
        : orderCancelledOnTimeline && fullyRefunded
          ? "Order cancelled & fully refunded."
          : undefined,
    };
  }, [
    ridePayableTotal,
    order?.grandTotal,
    order?.fareAmount,
    order?.paymentStatus,
    orderRefunds,
    orderCancelledOnTimeline,
    paymentDetail,
  ]);

  const hasAssignedRider = order?.riderId != null && order.riderId > 0;
  const hasRouteCoords =
    order != null &&
    order.pickupLat != null &&
    order.pickupLon != null &&
    order.dropLat != null &&
    order.dropLon != null;
  const rideStatusNorm = order
    ? normalizeStatus(order.currentStatus ?? order.status)
    : "";
  /** Hide live map after trip ends — rider card stays half width. */
  const showLiveRiderMap =
    rideStatusNorm !== "delivered" &&
    rideStatusNorm !== "completed" &&
    rideStatusNorm !== "cancelled";

  const tripStartedAt = useMemo(() => {
    if (!order) return null;
    const fromStamp = stamps.find((s) => s.stageKey === "trip_started")?.at;
    if (fromStamp) return fromStamp;
    const status = normalizeStatus(order.currentStatus ?? order.status);
    if (status === "picked_up" || status === "in_transit" || status === "delivered") {
      return order.updatedAt || order.createdAt;
    }
    return null;
  }, [order, stamps]);

  const displayId =
    order?.formattedOrderId?.trim() ||
    order?.orderId?.trim() ||
    (order?.id != null ? `GMP${String(order.id).padStart(6, "0")}` : "—");

  const mapBlock =
    order && showLiveRiderMap && hasAssignedRider && hasRouteCoords ? (
      <RiderRouteMap
        key={`person-ride-map-${order.riderId}-${order.id}`}
        className="h-[300px] min-h-[300px] flex flex-col"
        orderId={order.id}
        orderIdText={displayId !== "—" ? displayId : null}
        orderChannelIds={[
          order.formattedOrderId,
          order.orderId,
          order.id != null ? `GMP${String(order.id).padStart(6, "0")}` : null,
        ]}
        riderId={order.riderId}
        riderName={order.riderName}
        storeName="Pickup"
        customerName={order.rideDetail?.passengerName ?? order.customerName}
        dropAddressFallback={
          order.dropAddressNormalized ?? order.dropAddressRaw ?? null
        }
        merchantStoreLat={order.pickupLat}
        merchantStoreLon={order.pickupLon}
        pickupAddressGeocoded={order.pickupAddressGeocoded}
        orderStatus={order.currentStatus ?? order.status}
        coreStatus={order.status}
        foodOrderStatus={null}
        pickedUpAt={tripStartedAt}
        riderPickedUpAt={tripStartedAt}
        pickupLat={order.pickupLat}
        pickupLon={order.pickupLon}
        dropLat={order.dropLat}
        dropLon={order.dropLon}
        pickupLegendLabel="Pickup"
        dropLegendLabel="Drop"
        prePickupMovementLabel="Rider → pickup"
        postPickupMovementLabel="Rider → drop"
        alwaysShowDropMarker
        pickupPinStyle="person"
      />
    ) : null;

  if (loading && !order) {
    return (
      <div className="person-ride-typo h-full min-h-0" style={{ background: PR_WHITE }}>
        <InfinitySpinner />
      </div>
    );
  }

  if (notFound || !order) {
    return <OrderNotFoundState className="person-ride-typo" />;
  }

  return (
    <>
      <div className="person-ride-typo relative flex h-full min-h-0 flex-1 flex-col text-[13px] leading-relaxed text-slate-700 lg:overflow-hidden">
        <OrderNthUserBanner ordinal={nthOrdinal} customerName={order.customerName} />
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-4 sm:px-4 md:gap-4 md:px-6 lg:flex-row lg:overflow-hidden">
          <div className="w-full min-w-0 space-y-3 bg-[#F8FAFC] pt-0 lg:min-h-0 lg:flex-[4] lg:overflow-y-auto lg:overscroll-y-contain lg:pr-3">
            <PersonRideOrderHeader
              order={order}
              tickets={tickets}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              routedToLabel={routedToLabel}
              statusHistory={statusHistory}
              onStatusHistoryChange={setStatusHistory}
              loggedInEmail={loggedInEmail}
              onManualStatusApplied={(status) => void handleManualStatusApplied(status)}
            />

            <OrderTimeline
              orderId={order.id}
              orderType="person_ride"
              initialEntries={timelineEntries}
              currentStatus={order.currentStatus ?? order.status ?? undefined}
              orderCreatedAt={order.createdAt ? new Date(order.createdAt) : undefined}
              completedAt={
                rideStatusNorm === "delivered" || rideStatusNorm === "completed"
                  ? order.updatedAt
                  : null
              }
            />

            <div className="space-y-3.5 pt-1">
              <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <PassengerCard
                  order={order}
                  ratings={ratings}
                  walletBalance={walletBalance}
                />
                <PickupCard order={order} />
                <DropCard order={order} />
              </div>

              {/* Rider stays half-width always — never expand when map is hidden. */}
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-3">
                <div className="w-full min-w-0 md:w-1/2 md:max-w-[50%] md:shrink-0">
                  <RiderDetails
                    className="flex flex-col"
                    activityLogRefreshKey={activityLogRefreshKey}
                    riderSelfieUrl={captain?.selfieUrl ?? null}
                    forceAssignment={forceAssignment}
                    dispatchSessionActive={dispatchSessionActive}
                    order={{
                      orderId: order.id,
                      formattedOrderId: displayId !== "—" ? displayId : null,
                      riderId: order.riderId ?? null,
                      riderName: order.riderName,
                      riderMobile: order.riderMobile,
                      riderProvider: hasAssignedRider
                        ? formatDeliveredByLabel(null, order.riderId)
                        : null,
                      trackingOrderId: hasAssignedRider ? displayId : null,
                      trackingUrl: null,
                      deliveryOtp: order.rideDetail?.pickupOtp ?? null,
                      status: order.status,
                      currentStatus: order.currentStatus,
                      createdAt: order.createdAt,
                      distanceKm: order.distanceKm,
                      orderType: "person_ride",
                    }}
                    customerFeedback={order.customerFeedback ?? null}
                    tipAmount={order.tipAmount}
                    onOpenFeedback={() => setFeedbackSheetTarget("rider")}
                    onCopy={handleCopy}
                    onRiderManagementComplete={(detail) => {
                      if (detail.action === "force_assignment") {
                        setWatchForceAssignment(true);
                        setWatchRiderAssignment(false);
                      } else if (detail.action === "hard_assign") {
                        setWatchForceAssignment(false);
                        setForceAssignment(null);
                        setDispatchSessionActive(false);
                        setWatchRiderAssignment(false);
                      } else if (
                        detail.action === "assign_rider" ||
                        detail.action === "cancel_reassign"
                      ) {
                        setWatchForceAssignment(false);
                        setDispatchSessionActive(true);
                        setWatchRiderAssignment(true);
                      } else {
                        setWatchForceAssignment(false);
                        setDispatchSessionActive(false);
                        setWatchRiderAssignment(false);
                      }
                      setActivityLogRefreshKey((k) => k + 1);
                      void handleRefresh();
                    }}
                  />
                </div>
                {mapBlock ? (
                  <div className="w-full min-w-0 min-h-[300px] h-[300px] md:flex-1 md:basis-0">
                    {mapBlock}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="w-full min-w-0 space-y-4 bg-[#F8FAFC] pt-0 lg:min-h-0 lg:w-[320px] lg:max-w-[320px] lg:flex-none lg:overflow-y-auto lg:overscroll-y-contain lg:pl-3 xl:w-[360px] xl:max-w-[360px]">
            <PersonRideRightSidebar
              order={order}
              paymentPanel={
                <PaymentDetails
                  order={{
                    id: order.id,
                    orderType: "person_ride",
                    orderSource: order.orderSource,
                    paymentStatus: order.paymentStatus,
                    paymentMethod: order.paymentMethod,
                    fareAmount: order.fareAmount,
                    itemTotal: order.itemTotal,
                    totalAmount:
                      order.grandTotal ?? order.fareAmount ?? order.itemTotal,
                    grandTotal: order.grandTotal ?? order.fareAmount,
                    tipAmount: order.tipAmount,
                  }}
                  displayId={displayId}
                  orderRefunds={orderRefunds.map((r) => ({
                    id: r.id,
                    refundReason: r.refundReason ?? "",
                    refundAmount: r.refundAmount,
                    refundStatus: r.refundStatus,
                    executionStatus: r.executionStatus ?? null,
                    refundType: r.refundType ?? null,
                    initiatedByEmail: r.initiatedByEmail ?? null,
                    createdAt:
                      r.createdAt instanceof Date
                        ? r.createdAt.toISOString()
                        : String(r.createdAt ?? ""),
                  }))}
                  paymentDetail={paymentDetail}
                />
              }
              onClearHold={() => setClearHoldModalOpen(true)}
              clearingHold={clearingHold}
              holdCleared={holdCleared}
              onCreateRefund={() => setRefundModalOpen(true)}
              refundDisabled={refundLock.noActionsLeft}
              refundDisabledReason={refundLock.disabledReason}
              refunds={orderRefunds}
              paymentStatus={
                paymentDetail?.records?.[0]?.paymentStatus ?? order.paymentStatus
              }
              onRoutedTo={applyRoutedTo}
            />
          </div>
        </div>
      </div>

      <ConfirmModal
        open={clearHoldModalOpen}
        title="Clear rider payment hold?"
        description={
          <>
            Release this rider from the payment-wait hold? The rider will receive earnings and can
            accept new offers. The customer will still need to pay before booking another ride.
          </>
        }
        confirmLabel="Clear hold"
        cancelLabel="Cancel"
        confirmBusy={clearingHold}
        onClose={() => {
          if (!clearingHold) setClearHoldModalOpen(false);
        }}
        onConfirm={handleClearRiderHold}
      />

      <PersonRideRefundModal
        isOpen={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        orderId={order.id}
        payableTotal={ridePayableTotal}
        remainingRefundable={refundLock.remainingRefundable}
        orderAlreadyCancelled={orderCancelledOnTimeline}
        refundActionsDisabled={refundLock.noActionsLeft}
        onRoutedTo={applyRoutedTo}
        onRefundCreated={() => {
          void loadRefunds(order.id);
          void handleRefresh();
        }}
        onToast={(message, tone) => toast(message, tone === "error" ? "error" : "success")}
      />

      {feedbackSheetTarget != null && order.customerFeedback ? (
        <OrderCustomerFeedbackSideSheet
          target={feedbackSheetTarget}
          feedback={order.customerFeedback}
          tipAmount={order.tipAmount}
          riderName={order.riderName}
          onClose={() => setFeedbackSheetTarget(null)}
        />
      ) : null}
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OrderPaymentDetail } from "@/lib/orders/order-payment-types";
import {
  invalidateOrderDetailQuery,
  orderDetailQueryKey,
  refetchOrderDetailFresh,
  useOrderDetailQuery,
} from "@/hooks/queries/useOrderDetailQuery";
import { useToast } from "@/context/ToastContext";
import { OrderNotFoundState } from "@/components/orders/OrderNotFoundState";
import { prefetchPartnerChat } from "@/lib/partnerChatCache";
import { prefetchRiderActivityLog } from "@/lib/riderActivityLogCache";
import type { OrderRiderTrackingPayload } from "@/lib/db/operations/order-rider-tracking";
import RiderRouteMap from "../RiderRouteMap";
import PersonRideRefundModal from "../person-ride/PersonRideRefundModal";
import { type TimelineStamp } from "../person-ride/PersonRideDetailSections";
import { PR_MUTED, PR_WHITE, normalizeStatus } from "../person-ride/person-ride-utils";
import { isRideFarePaymentPending } from "@/lib/riders/ride-wallet-credit-pending";
import { readCustomerOrderStats } from "@/lib/orders/customer-order-stats";
import OrderNthUserBanner from "../OrderNthUserBanner";
import RiderDetails, { type ForceAssignmentLiveState } from "../RiderDetails";
import OrderTimeline, { type OrderTimelineEntry } from "../OrderTimeline";
import PaymentDetails from "../PaymentDetails";
import { OrderPartnerChatSideSheet } from "../OrderPartnerChatSideSheet";
import {
  OrderCustomerFeedbackSideSheet,
  type FeedbackSheetTarget,
} from "../OrderCustomerFeedbackSideSheet";
import {
  OrderRoutedToHistorySideSheet,
  fetchRoutedToHistory,
  invalidateRoutedToHistory,
  peekRoutedToHistory,
  seedRoutedToHistory,
  type RoutedToHistoryItem,
} from "../OrderRoutedToHistorySideSheet";
import {
  mapCoreRowToParcelDetail,
  type ParcelDetailOrder,
} from "./parcel-detail-types";
import ParcelOrderHeader, {
  type ParcelStatusHistoryEntry,
  type ParcelTicketSummary,
} from "./ParcelOrderHeader";
import { MANUAL_STATUS_LABELS, type ManualStatusValue } from "@/lib/orders/order-dispatch-status";
import { useAuthOptional } from "@/providers/AuthProvider";
import {
  PackageCard,
  PackagePaymentToggle,
  ReceiverCard,
  SenderCard,
} from "./ParcelDetailSections";
import ParcelRightSidebar from "./ParcelRightSidebar";
import { formatDeliveredByLabel } from "@/lib/orders/order-detail-display";

type OrderRefundListItem = {
  id: number;
  refundAmount: string;
  refundStatus: string | null;
  refundType?: string | null;
  refundReason?: string | null;
  refundDescription?: string | null;
  failureReason?: string | null;
  executionStatus?: string | null;
  customerWalletLedgerId?: number | null;
  razorpayRefundId?: string | null;
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
  routedToHistory?: RoutedToHistoryItem[];
};

function parseStatusHistoryEntry(raw: unknown): ParcelStatusHistoryEntry | null {
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
  return String(value ?? "");
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
    previousStatus:
      e.previousStatus != null ? String(e.previousStatus) : null,
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

function extractStamps(timeline: CoreResponse["timeline"], order: ParcelDetailOrder): TimelineStamp[] {
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
    const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
    const spaced = String(raw).trim().toLowerCase().replace(/_/g, " ");
    const mapped = statusToKey[key] || statusToKey[spaced] || key;
    const at =
      entry.occurredAt ||
      entry.occurred_at ||
      entry.createdAt ||
      entry.timestamp ||
      null;
    if (mapped && at) stamps.push({ stageKey: mapped, at: String(at) });
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
        Loading parcel details…
      </p>
    </div>
  );
}

export default function ParcelOrderDetailClient({
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
  const normalizedId = orderPublicId.trim().replace(/^#/, "");
  // Single source of truth — do NOT also call fetchOrderCorePayload in an effect
  // (that double-hit /api/orders/core and exhausted the DB pool → 30–40s hangs).
  const detailQuery = useOrderDetailQuery(normalizedId);

  const [order, setOrder] = useState<ParcelDetailOrder | null>(null);
  const [paymentDetail, setPaymentDetail] = useState<OrderPaymentDetail | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<OrderTimelineEntry[] | null>(null);
  const [stamps, setStamps] = useState<TimelineStamp[]>([]);
  const [tickets, setTickets] = useState<ParcelTicketSummary[]>([]);
  const [orderRefunds, setOrderRefunds] = useState<OrderRefundListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const loading = (detailQuery.isPending || detailQuery.isFetching) && !order;
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [statusHistory, setStatusHistory] = useState<ParcelStatusHistoryEntry[]>([]);
  const auth = useAuthOptional();
  const loggedInEmail = auth?.user?.email?.trim() || null;
  const [routedToLabel, setRoutedToLabel] = useState<string | null>(null);
  const [routedToEmail, setRoutedToEmail] = useState<string | null>(null);
  const [showRoutedToHistory, setShowRoutedToHistory] = useState(false);
  const [routedToHistory, setRoutedToHistory] = useState<RoutedToHistoryItem[] | null>(null);
  const routedToPrefetchInFlight = useRef(false);
  const [partnerChatOpen, setPartnerChatOpen] = useState(false);
  const [feedbackSheetTarget, setFeedbackSheetTarget] = useState<FeedbackSheetTarget | null>(
    null
  );
  const [nthOrdinal, setNthOrdinal] = useState<number | null>(null);
  const [forceAssignment, setForceAssignment] = useState<ForceAssignmentLiveState | null>(null);
  const [watchForceAssignment, setWatchForceAssignment] = useState(false);
  const [dispatchSessionActive, setDispatchSessionActive] = useState(false);
  const [watchRiderAssignment, setWatchRiderAssignment] = useState(false);
  const [activityLogRefreshKey, setActivityLogRefreshKey] = useState(0);
  const [pageVisible, setPageVisible] = useState(true);
  const [senderOverallRating, setSenderOverallRating] = useState<number | null>(null);
  const [riderOverallRating, setRiderOverallRating] = useState<number | null>(null);
  const [riderTrackingInitial, setRiderTrackingInitial] = useState<
    OrderRiderTrackingPayload | null | undefined
  >(undefined);
  /** Avoid duplicate /rider-tracking when applyPayload already kicked it off. */
  const riderTrackingFetchForRef = useRef<number | null>(null);

  const applyRoutedTo = useCallback((info: { email: string | null; name: string | null }) => {
    const email = info.email?.trim() || null;
    const label = routedToLabelFrom(info.name, email);
    if (label) setRoutedToLabel(label);
    if (email) setRoutedToEmail(email);
    const orderId = order?.id;
    if (orderId != null && Number.isFinite(orderId)) {
      invalidateRoutedToHistory(orderId);
      setRoutedToHistory(null);
      void fetchRoutedToHistory(orderId)
        .then((rows) => setRoutedToHistory(rows))
        .catch(() => setRoutedToHistory([]));
    }
  }, [order?.id]);

  const ensureRoutedToHistoryPrefetch = useCallback(() => {
    const orderId = order?.id;
    if (orderId == null || !Number.isFinite(orderId)) return;
    const cached = peekRoutedToHistory(orderId);
    if (cached) {
      setRoutedToHistory(cached);
      return;
    }
    if (routedToPrefetchInFlight.current) return;
    routedToPrefetchInFlight.current = true;
    void fetchRoutedToHistory(orderId)
      .then((rows) => setRoutedToHistory(rows))
      .catch(() => setRoutedToHistory([]))
      .finally(() => {
        routedToPrefetchInFlight.current = false;
      });
  }, [order?.id]);

  useEffect(() => {
    setRoutedToHistory(null);
    setShowRoutedToHistory(false);
    setPartnerChatOpen(false);
    setSenderOverallRating(null);
    setRiderOverallRating(null);
  }, [order?.id]);

  // Clear tracking only when navigating to a different public order id (not first mount).
  const prevNormalizedIdRef = useRef(normalizedId);
  useEffect(() => {
    if (prevNormalizedIdRef.current === normalizedId) return;
    prevNormalizedIdRef.current = normalizedId;
    setRiderTrackingInitial(undefined);
    riderTrackingFetchForRef.current = null;
  }, [normalizedId]);

  // Instant sender rating from order enrichment; refine via ratings API.
  useEffect(() => {
    const trust = order?.customerTrustScore;
    if (trust != null && Number.isFinite(Number(trust)) && Number(trust) > 0) {
      setSenderOverallRating((prev) =>
        prev != null && prev > 0 ? prev : Math.round(Number(trust) * 10) / 10
      );
    }
  }, [order?.id, order?.customerTrustScore]);

  // Sender + rider overall ratings (same SSOT as person-ride ratings API).
  useEffect(() => {
    const current = order;
    const orderId = current?.id;
    if (current == null || orderId == null || !Number.isFinite(orderId)) return;
    const riderId =
      current.riderId != null &&
      Number.isFinite(Number(current.riderId)) &&
      Number(current.riderId) > 0
        ? Number(current.riderId)
        : null;
    const customerId =
      current.customerId != null &&
      Number.isFinite(Number(current.customerId)) &&
      Number(current.customerId) > 0
        ? Number(current.customerId)
        : null;
    if (riderId == null && customerId == null) return;

    let cancelled = false;
    void (async () => {
      try {
        const qs = new URLSearchParams();
        if (riderId != null) qs.set("riderId", String(riderId));
        if (customerId != null) qs.set("customerId", String(customerId));
        const res = await fetch(`/api/orders/${orderId}/person-ride-ratings?${qs.toString()}`);
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: {
            riderAvgRating?: number | null;
            customerAvgRating?: number | null;
          };
        } | null;
        if (cancelled || !json?.success || !json.data) {
          // Keep trust-score fallback already painted for sender.
          if (
            !cancelled &&
            customerId != null &&
            current.customerTrustScore != null &&
            Number(current.customerTrustScore) > 0
          ) {
            setSenderOverallRating(Math.round(Number(current.customerTrustScore) * 10) / 10);
          }
          return;
        }
        const riderAvg = Number(json.data.riderAvgRating);
        const cxAvg = Number(json.data.customerAvgRating);
        const trustFallback =
          current.customerTrustScore != null &&
          Number.isFinite(Number(current.customerTrustScore)) &&
          Number(current.customerTrustScore) > 0
            ? Math.round(Number(current.customerTrustScore) * 10) / 10
            : null;
        setRiderOverallRating(
          Number.isFinite(riderAvg) && riderAvg > 0 ? Math.round(riderAvg * 10) / 10 : null
        );
        setSenderOverallRating(
          Number.isFinite(cxAvg) && cxAvg > 0
            ? Math.round(cxAvg * 10) / 10
            : trustFallback
        );
      } catch {
        if (!cancelled) {
          setRiderOverallRating(null);
          const trust = current.customerTrustScore;
          setSenderOverallRating(
            trust != null && Number(trust) > 0
              ? Math.round(Number(trust) * 10) / 10
              : null
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.id, order?.riderId, order?.customerId, order?.customerTrustScore]);

  useEffect(() => {
    onLoadingChange?.(loading && !order);
  }, [loading, order, onLoadingChange]);

  /** Fallback if applyPayload did not already kick /rider-tracking. */
  useEffect(() => {
    const orderId = order?.id;
    if (orderId == null || !Number.isFinite(orderId)) return;
    if (riderTrackingInitial !== undefined) return;
    if (riderTrackingFetchForRef.current === orderId) return;

    let cancelled = false;
    riderTrackingFetchForRef.current = orderId;
    void fetch(`/api/orders/${orderId}/rider-tracking`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json().catch(() => null))
      .then((body) => {
        if (cancelled) return;
        if (body && typeof body === "object") {
          setRiderTrackingInitial(body as OrderRiderTrackingPayload);
        } else {
          setRiderTrackingInitial(null);
        }
      })
      .catch(() => {
        if (!cancelled) setRiderTrackingInitial(null);
      });

    return () => {
      cancelled = true;
    };
  }, [order?.id, riderTrackingInitial]);

  const applyPayload = useCallback(
    (body: CoreResponse): ParcelDetailOrder | null => {
      if (!body.success || !Array.isArray(body.data) || body.data.length === 0) {
        setNotFound(true);
        setOrder(null);
        setTimelineEntries(null);
        onNotFoundChange?.(true);
        setNthOrdinal(null);
        setError(body.error || "Parcel not found");
        return null;
      }
      try {
        const row = body.data[0] as Record<string, unknown>;
        const mapped = mapCoreRowToParcelDetail(row);
        setOrder(mapped);
        setNthOrdinal(readCustomerOrderStats(row).ordinal);
        setNotFound(false);
        onNotFoundChange?.(false);
        setError(null);
        setPaymentDetail(body.paymentDetail ?? null);
        if (Array.isArray(body.statusHistory)) {
          setStatusHistory(
            body.statusHistory
              .map(parseStatusHistoryEntry)
              .filter((h): h is ParcelStatusHistoryEntry => h != null)
          );
        } else {
          setStatusHistory([]);
        }
        const timeline = Array.isArray(body.timeline) ? body.timeline : [];
        setTimelineEntries(timeline.length > 0 ? mapTimelineEntries(timeline) : []);
        setStamps(extractStamps(timeline, mapped));
        const dispatchUi = body.riderDispatchUi;
        if (dispatchUi && typeof dispatchUi === "object") {
          setDispatchSessionActive(Boolean(dispatchUi.dispatchSessionActive));
          setWatchRiderAssignment(Boolean(dispatchUi.dispatchSessionActive));
        } else {
          setDispatchSessionActive(false);
        }
        const history = Array.isArray(body.routedToHistory) ? body.routedToHistory : [];
        if (history.length > 0) {
          seedRoutedToHistory(mapped.id, history);
          setRoutedToHistory(history);
        } else {
          setRoutedToHistory(null);
        }
        const latestRouted = history[0] ?? null;
        const email =
          latestRouted?.actorEmail?.trim() || mapped.routedToEmail?.trim() || null;
        setRoutedToEmail(email);
        setRoutedToLabel(routedToLabelFrom(latestRouted?.actorName, email));
        prefetchPartnerChat(mapped.id);
        prefetchRiderActivityLog(mapped.id);
        // Kick rider map tracking immediately (don't wait for map mount / paint).
        if (riderTrackingFetchForRef.current !== mapped.id) {
          riderTrackingFetchForRef.current = mapped.id;
          void fetch(`/api/orders/${mapped.id}/rider-tracking`, {
            credentials: "include",
            cache: "no-store",
          })
            .then((r) => r.json().catch(() => null))
            .then((trackingBody) => {
              if (riderTrackingFetchForRef.current !== mapped.id) return;
              if (trackingBody && typeof trackingBody === "object") {
                setRiderTrackingInitial(trackingBody as OrderRiderTrackingPayload);
              } else {
                setRiderTrackingInitial(null);
              }
            })
            .catch(() => {
              if (riderTrackingFetchForRef.current === mapped.id) {
                setRiderTrackingInitial(null);
              }
            });
        }
        return mapped;
      } catch (e) {
        console.error("[ParcelOrderDetailClient] applyPayload failed", e);
        setNotFound(true);
        setOrder(null);
        onNotFoundChange?.(true);
        setError(e instanceof Error ? e.message : "Failed to parse parcel");
        return null;
      }
    },
    [onNotFoundChange]
  );

  const loadTickets = useCallback(async (orderId: number) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/tickets`);
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: ParcelTicketSummary[];
      } | null;
      setTickets(json?.success && Array.isArray(json.data) ? json.data : []);
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
    async (orderId: number, mapped: ParcelDetailOrder) => {
      try {
        const res = await fetch(`/api/orders/${orderId}/timeline`);
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: TimelineEntryFromApi[];
        } | null;
        if (json?.success && Array.isArray(json.data)) {
          setTimelineEntries(
            json.data.length > 0 ? mapTimelineEntries(json.data) : []
          );
          setStamps(extractStamps(json.data, mapped));
        } else {
          setTimelineEntries((prev) => prev ?? []);
        }
      } catch {
        setTimelineEntries((prev) => prev ?? []);
      }
    },
    []
  );

  const hydrateExtras = useCallback(
    (mapped: ParcelDetailOrder, body: CoreResponse) => {
      // Defer secondary fetches so tracking / first paint aren't competing for bandwidth.
      const run = () => {
        void loadTickets(mapped.id);
        void loadRefunds(mapped.id);
        if (!body.paymentDetail) void loadPaymentFallback(mapped.id);
        if (!Array.isArray(body.timeline)) void loadTimelineFallback(mapped.id, mapped);
      };
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: 1200 });
      } else {
        setTimeout(run, 0);
      }
    },
    [loadTickets, loadRefunds, loadPaymentFallback, loadTimelineFallback]
  );

  const handleCopy = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).then(
          () => toast("Copied", "success"),
          () => toast("Copy failed", "error")
        );
      }
    },
    [toast]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const body = (await refetchOrderDetailFresh(queryClient, normalizedId)) as CoreResponse;
      queryClient.setQueryData(orderDetailQueryKey(normalizedId), body);
      const mapped = applyPayload(body);
      await invalidateOrderDetailQuery(queryClient, normalizedId);
      if (mapped) hydrateExtras(mapped, body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, normalizedId, applyPayload, hydrateExtras]);

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Hydrate from react-query only (`detailQuery` — never reference removed `cachedQuery`).
  useEffect(() => {
    if (detailQuery.isPending) return;
    if (detailQuery.isError) {
      setError(
        detailQuery.error instanceof Error
          ? detailQuery.error.message
          : "Failed to load parcel"
      );
      setNotFound(true);
      onNotFoundChange?.(true);
      return;
    }
    const body = detailQuery.data as CoreResponse | undefined;
    if (!body) return;
    const mapped = applyPayload(body);
    if (mapped) hydrateExtras(mapped, body);
  }, [
    detailQuery.data,
    detailQuery.isPending,
    detailQuery.isError,
    detailQuery.error,
    applyPayload,
    hydrateExtras,
    onNotFoundChange,
  ]);

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
      ["CANCELLED", "FAILED", "REJECTED"].includes(statusUpper);
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
        /* ignore transient poll errors */
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    order,
    pageVisible,
    watchRiderAssignment,
    dispatchSessionActive,
  ]);

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
  }, [
    order?.id,
    pageVisible,
    watchForceAssignment,
    forceAssignment?.status,
    handleRefresh,
  ]);

  const orderCancelledOnTimeline = useMemo(() => {
    if (!order) return false;
    return normalizeStatus(order.currentStatus ?? order.status) === "cancelled";
  }, [order]);

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
          ? "Order marked complete. Rider payout and customer apps will update."
          : `Status updated to ${MANUAL_STATUS_LABELS[status]}.`,
        "success"
      );
      setActivityLogRefreshKey((k) => k + 1);
      await handleRefresh();
    },
    [loggedInEmail, order?.id, order?.currentStatus, order?.status, toast, handleRefresh]
  );

  const parcelPayableTotal = useMemo(() => {
    if (!order) return 0;
    return (
      Number(
        paymentDetail?.totalPaid ??
          paymentDetail?.totalAmount ??
          order.grandTotal ??
          order.parcelDetail?.finalFare ??
          order.parcelDetail?.estimatedFare ??
          order.fareAmount ??
          0
      ) || 0
    );
  }, [order, paymentDetail]);

  const refundLock = useMemo(() => {
    const grandTotal = parcelPayableTotal;
    const alreadyRefunded = (orderRefunds ?? []).reduce((sum, r) => {
      const status = String(r.refundStatus ?? "").toLowerCase();
      if (status === "failed" || status === "cancelled" || status === "rejected") return sum;
      const amt = Number(r.refundAmount ?? 0);
      return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);
    const fullyRefunded = grandTotal > 0 && alreadyRefunded >= grandTotal - 0.01;
    const payStatus =
      paymentDetail?.records?.[0]?.paymentStatus ?? order?.paymentStatus ?? null;
    const payMethod = String(
      order?.parcelDetail?.paymentMethod ?? order?.paymentMethod ?? ""
    )
      .trim()
      .toLowerCase();
    const isCashOrCod =
      order?.parcelDetail?.isCod === true ||
      payMethod.includes("cash") ||
      payMethod.includes("cod");
    const cashCollected = Boolean(
      order?.parcelDetail?.cashCollectedAt &&
        String(order.parcelDetail.cashCollectedAt).trim()
    );
    const onlinePaid =
      !isRideFarePaymentPending(payStatus) ||
      (paymentDetail?.records ?? []).some((r) => {
        const s = String(r.paymentStatus ?? "").trim().toUpperCase();
        return ["PAID", "CAPTURED", "SUCCESS", "COMPLETED", "CAPTURE"].includes(s);
      });
    // Cash/COD: wait for collect. Online: wait for capture/paid. Never unlock on isCod alone.
    const paymentCollected = isCashOrCod ? cashCollected : onlinePaid;
    return {
      fullyRefunded,
      remainingRefundable: Math.max(grandTotal - alreadyRefunded, 0),
      noActionsLeft: !paymentCollected || (orderCancelledOnTimeline && fullyRefunded),
      disabledReason: !paymentCollected
        ? isCashOrCod
          ? "Payment not collected — refund unavailable until cash is collected."
          : "Payment not captured — refund unavailable."
        : orderCancelledOnTimeline && fullyRefunded
          ? "Order cancelled & fully refunded."
          : undefined,
    };
  }, [
    parcelPayableTotal,
    order?.paymentStatus,
    order?.paymentMethod,
    order?.parcelDetail?.isCod,
    order?.parcelDetail?.paymentMethod,
    order?.parcelDetail?.cashCollectedAt,
    orderRefunds,
    orderCancelledOnTimeline,
    paymentDetail,
  ]);

  const hasAssignedRider = order?.riderId != null && order.riderId > 0;
  const hasRouteCoords =
    order?.pickupLat != null &&
    order.pickupLon != null &&
    order.dropLat != null &&
    order.dropLon != null;
  const parcelStatusNorm = order
    ? normalizeStatus(order.currentStatus ?? order.status)
    : "";
  /** Hide live map after delivery / cancel — keep rider card at half width. */
  const showLiveRiderMap =
    parcelStatusNorm !== "delivered" &&
    parcelStatusNorm !== "completed" &&
    parcelStatusNorm !== "cancelled";

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

  const mapBlock =
    showLiveRiderMap && hasAssignedRider && hasRouteCoords ? (
      <RiderRouteMap
        key={`parcel-map-${order.riderId}-${order.id}`}
        className="h-[300px] min-h-[300px] flex flex-col"
        orderId={order.id}
        orderIdText={
          order.formattedOrderId?.trim() ||
          order.orderId?.trim() ||
          (order.id != null ? `GMC${String(order.id).padStart(6, "0")}` : null)
        }
        orderChannelIds={[
          order.formattedOrderId,
          order.orderId,
          order.id != null ? `GMC${String(order.id).padStart(6, "0")}` : null,
        ]}
        riderId={order.riderId}
        riderName={order.riderName}
        storeName="Pickup"
        customerName={order.parcelDetail?.receiverName ?? order.customerName}
        dropAddressFallback={order.dropAddressNormalized ?? order.dropAddressRaw ?? null}
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
        prePickupMovementLabel="Captain → pickup"
        postPickupMovementLabel="Captain → drop"
        alwaysShowDropMarker
        pickupPinStyle="person"
        initialTracking={riderTrackingInitial ?? null}
      />
    ) : showLiveRiderMap && hasAssignedRider ? (
      <div className="flex h-[300px] min-h-[300px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-[12px] text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        Route map will appear when pickup & drop coordinates are available.
      </div>
    ) : null;

  if (loading && !order) {
    return (
      <div className="parcel-order-typo h-full min-h-0" style={{ background: PR_WHITE }}>
        <InfinitySpinner />
      </div>
    );
  }

  if (notFound || !order) {
    return <OrderNotFoundState className="parcel-order-typo" />;
  }

  return (
    <>
      <div className="parcel-order-typo relative flex h-full min-h-0 flex-1 flex-col text-[12px] text-slate-700 md:text-[13px] lg:overflow-hidden">
        <OrderNthUserBanner ordinal={nthOrdinal} customerName={order.customerName} />
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-3 sm:px-4 md:px-6 lg:flex-row lg:gap-3 lg:overflow-hidden">
        <div className="w-full min-w-0 space-y-2 bg-[#F8FAFC] pt-0 lg:min-h-0 lg:flex-[4] lg:overflow-y-auto lg:overscroll-y-contain lg:pr-3">
          <ParcelOrderHeader
            order={order}
            tickets={tickets}
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            routedToLabel={routedToLabel}
            onOpenRoutedToHistory={() => setShowRoutedToHistory(true)}
            onPrefetchRoutedToHistory={ensureRoutedToHistoryPrefetch}
            statusHistory={statusHistory}
            onStatusHistoryChange={setStatusHistory}
            loggedInEmail={loggedInEmail}
            onManualStatusApplied={(status) => void handleManualStatusApplied(status)}
          />

          <div className="mt-2 mb-2 min-w-0 max-w-full overflow-hidden">
            <OrderTimeline
              orderId={order.id}
              orderType="parcel"
              initialEntries={timelineEntries}
              currentStatus={order.currentStatus ?? order.status ?? undefined}
              orderCreatedAt={order.createdAt ? new Date(order.createdAt) : undefined}
              completedAt={
                normalizeStatus(order.currentStatus ?? order.status) === "delivered"
                  ? order.updatedAt
                  : null
              }
              fareCollectedAt={order.parcelDetail?.cashCollectedAt ?? null}
              farePaymentMode={(() => {
                const method = String(
                  order.parcelDetail?.paymentMethod ?? order.paymentMethod ?? ""
                )
                  .trim()
                  .toLowerCase();
                if (
                  method.includes("online") ||
                  method.includes("wallet") ||
                  method.includes("upi") ||
                  method.includes("gati")
                ) {
                  return "Online";
                }
                if (
                  order.parcelDetail?.isCod === true ||
                  method.includes("cash") ||
                  method.includes("cod")
                ) {
                  return "COD";
                }
                return order.parcelDetail?.cashCollectedAt ? "Online" : null;
              })()}
              etaAt={
                order.etaSeconds != null && order.createdAt
                  ? new Date(
                      new Date(order.createdAt).getTime() +
                        Number(order.etaSeconds) * 1000
                    )
                  : undefined
              }
            />
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="grid items-stretch gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,1.15fr)]">
              <SenderCard
                order={order}
                overallRating={senderOverallRating}
                onOpenPartnerChat={() => setPartnerChatOpen(true)}
              />
              <ReceiverCard order={order} />
              <PackagePaymentToggle
                packagePanel={<PackageCard order={order} />}
                paymentPanel={
                  <PaymentDetails
                    order={{
                      id: order.id,
                      orderType: "parcel",
                      orderSource: order.orderSource,
                      paymentStatus: order.paymentStatus,
                      paymentMethod:
                        order.paymentMethod ?? order.parcelDetail?.paymentMethod ?? null,
                      fareAmount: order.fareAmount,
                      itemTotal: order.itemTotal,
                      totalAmount:
                        order.grandTotal ??
                        order.parcelDetail?.finalFare ??
                        order.parcelDetail?.estimatedFare ??
                        order.fareAmount,
                      grandTotal:
                        order.grandTotal ??
                        order.parcelDetail?.finalFare ??
                        order.parcelDetail?.estimatedFare ??
                        null,
                      tipAmount: order.tipAmount,
                    }}
                    displayId={
                      order.formattedOrderId?.trim() ||
                      order.orderId?.trim() ||
                      (order.id != null ? `GMC${String(order.id).padStart(6, "0")}` : "—")
                    }
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
              />
            </div>

            {/* Rider stays half-width always — never expand when map is hidden / no rider. */}
            <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:gap-2.5">
              <div className="w-full min-w-0 md:w-1/2 md:max-w-[50%] md:shrink-0">
                <RiderDetails
                  className="flex flex-col"
                  forceAssignment={forceAssignment}
                  dispatchSessionActive={dispatchSessionActive}
                  activityLogRefreshKey={activityLogRefreshKey}
                  order={{
                    orderId: order.id,
                    formattedOrderId:
                      order.formattedOrderId?.trim() ||
                      order.orderId?.trim() ||
                      (order.id != null ? `GMC${String(order.id).padStart(6, "0")}` : null),
                    riderId: order.riderId ?? null,
                    riderName: order.riderName,
                    riderMobile: order.riderMobile,
                    riderProvider: hasAssignedRider
                      ? formatDeliveredByLabel(order.deliveredBy, order.riderId)
                      : null,
                    trackingOrderId: hasAssignedRider
                      ? order.formattedOrderId?.trim() || order.orderId?.trim() || null
                      : null,
                    trackingUrl: null,
                    deliveryOtp: order.parcelDetail?.deliveryOtp ?? null,
                    status: order.status,
                    currentStatus: order.currentStatus,
                    createdAt: order.createdAt,
                    distanceKm: order.distanceKm,
                    orderType: order.orderType ?? "parcel",
                  }}
                  deliveryProofImageUrl={order.parcelDetail?.deliveryProofImageUrl ?? null}
                  customerFeedback={order.customerFeedback ?? null}
                  tipAmount={order.tipAmount}
                  onOpenFeedback={() => setFeedbackSheetTarget("rider")}
                  onCopy={handleCopy}
                  onRiderManagementComplete={(detail) => {
                    if (detail.routedToEmail?.trim()) {
                      const email = detail.routedToEmail.trim();
                      setRoutedToEmail(email);
                      setRoutedToLabel(routedToLabelFrom(null, email));
                      invalidateRoutedToHistory(order.id);
                      setRoutedToHistory(null);
                      void fetchRoutedToHistory(order.id)
                        .then((rows) => setRoutedToHistory(rows))
                        .catch(() => setRoutedToHistory([]));
                    }
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

        <div className="w-full min-w-0 space-y-3 bg-[#F8FAFC] pt-0 lg:min-h-0 lg:w-[320px] lg:max-w-[320px] lg:flex-none lg:overflow-y-auto lg:overscroll-y-contain lg:pl-2 xl:w-[360px] xl:max-w-[360px]">
          <ParcelRightSidebar
            order={order}
            activityRefreshKey={activityLogRefreshKey}
            overallRating={hasAssignedRider ? riderOverallRating : null}
            onCreateRefund={() => setRefundModalOpen(true)}
            refundDisabled={refundLock.noActionsLeft}
            refundDisabledReason={refundLock.disabledReason}
            refunds={orderRefunds}
            onRoutedTo={applyRoutedTo}
          />
        </div>
      </div>
      </div>

      <PersonRideRefundModal
        isOpen={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        orderId={order.id}
        payableTotal={parcelPayableTotal}
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

      {partnerChatOpen ? (
        <OrderPartnerChatSideSheet
          orderCoreId={order.id}
          orderLabel={
            order.formattedOrderId?.trim() ||
            order.orderId?.trim() ||
            `#${order.id}`
          }
          customerName={order.customerName}
          riderName={order.riderName}
          onClose={() => setPartnerChatOpen(false)}
        />
      ) : null}

      {showRoutedToHistory ? (
        <OrderRoutedToHistorySideSheet
          orderId={order.id}
          currentEmail={routedToEmail}
          initialItems={routedToHistory ?? peekRoutedToHistory(order.id)}
          onClose={() => setShowRoutedToHistory(false)}
        />
      ) : null}
    </>
  );
}

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
import RiderRouteMap from "../RiderRouteMap";
import PersonRideRefundModal from "./PersonRideRefundModal";
import {
  mapCoreRowToPersonRideDetail,
  type PersonRideDetailOrder,
} from "./person-ride-detail-types";
import PersonRideOrderHeader, {
  type PersonRideTicketSummary,
} from "./PersonRideOrderHeader";
import {
  CaptainCard,
  FareSummaryCard,
  PassengerCard,
  TripDetailsCard,
  type CaptainInfo,
  type RideRatings,
  type TimelineStamp,
} from "./PersonRideDetailSections";
import PersonRideRightSidebar from "./PersonRideRightSidebar";
import { PR_BLACK, PR_MUTED, PR_WHITE, normalizeStatus } from "./person-ride-utils";
import { buildRideInvoiceLinesFromSnapshot } from "@/lib/orders/ride-invoice-lines";
import { isRideFarePaymentPending } from "@/lib/riders/ride-wallet-credit-pending";

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

type CoreResponse = {
  success?: boolean;
  data?: unknown[];
  error?: string;
  paymentDetail?: OrderPaymentDetail;
  timeline?: Array<{
    stageKey?: string | null;
    stage_key?: string | null;
    status?: string | null;
    occurredAt?: string | null;
    occurred_at?: string | null;
    createdAt?: string | null;
    timestamp?: string | null;
  }>;
  routedToHistory?: Array<{
    actorEmail?: string | null;
    actorName?: string | null;
  }>;
};

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
  const normalizedId = orderPublicId.trim().replace(/^#/, "");
  const cachedQuery = useOrderDetailQuery(normalizedId);

  const [order, setOrder] = useState<PersonRideDetailOrder | null>(null);
  const [paymentDetail, setPaymentDetail] = useState<OrderPaymentDetail | null>(null);
  const [stamps, setStamps] = useState<TimelineStamp[]>([]);
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
        setError(body.error || "Ride not found");
        return;
      }
      const row = body.data[0] as Record<string, unknown>;
      const mapped = mapCoreRowToPersonRideDetail(row);
      setOrder(mapped);
      setNotFound(false);
      onNotFoundChange?.(false);
      setError(null);
      setPaymentDetail(body.paymentDetail ?? null);
      setStamps(extractStamps(body.timeline, mapped));
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
        }
      } catch {
        // keep booked stamp
      }
    },
    []
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

  if (loading && !order) {
    return (
      <div className="person-ride-typo h-full min-h-0" style={{ background: PR_WHITE }}>
        <InfinitySpinner />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div
        className="person-ride-typo flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
        style={{ background: PR_WHITE }}
      >
        <p className="pr-heading text-lg font-semibold" style={{ color: PR_BLACK }}>
          Ride not found
        </p>
        <p className="pr-body text-[13px]" style={{ color: PR_MUTED }}>
          {error || `No person ride matches ${normalizedId}.`}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="person-ride-typo flex h-full min-h-0 flex-1 flex-col gap-3 text-[12px] text-slate-700 md:text-[13px] lg:flex-row lg:gap-4">
        <div className="w-full min-w-0 space-y-3 bg-[#F8FAFC] lg:min-h-0 lg:flex-[4] lg:overflow-y-auto lg:overscroll-y-contain lg:pr-3">
          <PersonRideOrderHeader
            order={order}
            tickets={tickets}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            routedToLabel={routedToLabel}
          />

          <div className="space-y-3 pt-1">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CaptainCard
                captain={captain}
                fallbackName={order.riderName}
                fallbackMobile={order.riderMobile}
                ratings={ratings}
                orderId={order.id}
                riderId={order.riderId}
              />
              <PassengerCard
                order={order}
                ratings={ratings}
                walletBalance={walletBalance}
              />
              <FareSummaryCard order={order} paymentDetail={paymentDetail} />
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
              <div className="w-full md:w-1/2">
                <TripDetailsCard order={order} />
              </div>
              {hasAssignedRider ? (
              <div className="w-full min-h-[360px] md:w-1/2">
                  <RiderRouteMap
                    key={`person-ride-map-${order.riderId}`}
                    className="h-full min-h-[360px] flex flex-col"
                    orderId={order.id}
                    orderIdText={
                      order.formattedOrderId?.trim() ||
                      order.orderId?.trim() ||
                      (order.id != null ? `GMP${String(order.id).padStart(6, "0")}` : null)
                    }
                    orderChannelIds={[
                      order.formattedOrderId,
                      order.orderId,
                      order.id != null ? `GMP${String(order.id).padStart(6, "0")}` : null,
                    ]}
                    riderId={order.riderId}
                    riderName={order.riderName}
                    storeName="Pickup"
                    customerName={
                      order.rideDetail?.passengerName ?? order.customerName
                    }
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
              </div>
              ) : (
                <div className="flex h-full min-h-[360px] w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-[12px] text-slate-500 md:w-1/2">
                  Route map appears when a captain is assigned.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="w-full min-w-0 space-y-3 bg-[#F8FAFC] lg:min-h-0 lg:w-[320px] lg:max-w-[320px] lg:flex-none lg:overflow-y-auto lg:overscroll-y-contain lg:pl-2 xl:w-[360px] xl:max-w-[360px]">
          <PersonRideRightSidebar
            order={order}
            stamps={stamps}
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
    </>
  );
}

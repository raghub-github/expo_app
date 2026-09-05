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
import { useToast } from "@/context/ToastContext";
import { OrderNotFoundState } from "@/components/orders/OrderNotFoundState";
import RiderRouteMap from "../RiderRouteMap";
import PersonRideRefundModal from "../person-ride/PersonRideRefundModal";
import {
  CaptainCard,
  type CaptainInfo,
  type RideRatings,
  type TimelineStamp,
} from "../person-ride/PersonRideDetailSections";
import { PR_BLACK, PR_MUTED, PR_WHITE, normalizeStatus } from "../person-ride/person-ride-utils";
import { isRideFarePaymentPending } from "@/lib/riders/ride-wallet-credit-pending";
import {
  mapCoreRowToParcelDetail,
  type ParcelDetailOrder,
} from "./parcel-detail-types";
import ParcelOrderHeader, { type ParcelTicketSummary } from "./ParcelOrderHeader";
import {
  PackageCard,
  ParcelFareSummaryCard,
  ParcelTripDetailsCard,
  ReceiverCard,
  SenderCard,
} from "./ParcelDetailSections";
import ParcelRightSidebar from "./ParcelRightSidebar";

type OrderRefundListItem = {
  id: number;
  refundAmount: string;
  refundStatus: string | null;
  refundType?: string | null;
  refundReason?: string | null;
  executionStatus?: string | null;
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
  const cachedQuery = useOrderDetailQuery(normalizedId);

  const [order, setOrder] = useState<ParcelDetailOrder | null>(null);
  const [paymentDetail, setPaymentDetail] = useState<OrderPaymentDetail | null>(null);
  const [stamps, setStamps] = useState<TimelineStamp[]>([]);
  const [captain, setCaptain] = useState<CaptainInfo | null>(null);
  const [ratings, setRatings] = useState<RideRatings | null>(null);
  const [tickets, setTickets] = useState<ParcelTicketSummary[]>([]);
  const [orderRefunds, setOrderRefunds] = useState<OrderRefundListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
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
        setError(body.error || "Parcel not found");
        return;
      }
      const row = body.data[0] as Record<string, unknown>;
      const mapped = mapCoreRowToParcelDetail(row);
      setOrder(mapped);
      setNotFound(false);
      onNotFoundChange?.(false);
      setError(null);
      setPaymentDetail(body.paymentDetail ?? null);
      setStamps(extractStamps(body.timeline, mapped));
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
    async (orderId: number, mapped: ParcelDetailOrder) => {
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
    (mapped: ParcelDetailOrder, body: CoreResponse) => {
      void loadCaptain(mapped.riderId);
      void loadTickets(mapped.id);
      void loadRatings(mapped.id, mapped.riderId, mapped.customerId);
      void loadRefunds(mapped.id);
      if (!body.paymentDetail) void loadPaymentFallback(mapped.id);
      if (!body.timeline) void loadTimelineFallback(mapped.id, mapped);
    },
    [loadCaptain, loadTickets, loadRatings, loadRefunds, loadPaymentFallback, loadTimelineFallback]
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const cached = cachedQuery.data as CoreResponse | undefined;
      if (cached?.success && Array.isArray(cached.data) && cached.data.length > 0) {
        applyPayload(cached);
        setLoading(false);
        const mapped = mapCoreRowToParcelDetail(cached.data[0] as Record<string, unknown>);
        hydrateExtras(mapped, cached);
        return;
      }
      setLoading(true);
      try {
        const body = (await fetchOrderCorePayload({ orderPublicId: normalizedId })) as CoreResponse;
        if (cancelled) return;
        applyPayload(body);
        queryClient.setQueryData(orderDetailQueryKey(normalizedId), body);
        if (body.success && Array.isArray(body.data) && body.data[0]) {
          const mapped = mapCoreRowToParcelDetail(body.data[0] as Record<string, unknown>);
          hydrateExtras(mapped, body);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load parcel");
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
        const mapped = mapCoreRowToParcelDetail(body.data[0] as Record<string, unknown>);
        hydrateExtras(mapped, body);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const orderCancelledOnTimeline = useMemo(() => {
    if (!order) return false;
    return normalizeStatus(order.currentStatus ?? order.status) === "cancelled";
  }, [order]);

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
    const isCod = order?.parcelDetail?.isCod === true;
    const hasPaymentRecord =
      isCod ||
      !isRideFarePaymentPending(payStatus) ||
      (paymentDetail?.records ?? []).some((r) => {
        const s = String(r.paymentStatus ?? "").trim().toUpperCase();
        return ["PAID", "CAPTURED", "SUCCESS", "COMPLETED", "CAPTURE"].includes(s);
      });
    return {
      fullyRefunded,
      remainingRefundable: Math.max(grandTotal - alreadyRefunded, 0),
      noActionsLeft: !hasPaymentRecord || (orderCancelledOnTimeline && fullyRefunded),
      disabledReason: !hasPaymentRecord
        ? "Payment not captured — refund unavailable."
        : orderCancelledOnTimeline && fullyRefunded
          ? "Order cancelled & fully refunded."
          : undefined,
    };
  }, [parcelPayableTotal, order?.paymentStatus, order?.parcelDetail?.isCod, orderRefunds, orderCancelledOnTimeline, paymentDetail]);

  const hasAssignedRider = order?.riderId != null && order.riderId > 0;
  const hasRouteCoords =
    order?.pickupLat != null &&
    order.pickupLon != null &&
    order.dropLat != null &&
    order.dropLon != null;

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

  const mapBlock = hasRouteCoords ? (
    <RiderRouteMap
      key={`parcel-map-${order.riderId ?? "static"}-${order.id}`}
      className="h-full min-h-[360px] flex flex-col"
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
      riderId={hasAssignedRider ? order.riderId : null}
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
    />
  ) : (
    <div className="flex h-full min-h-[360px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-[12px] text-slate-500">
      {hasAssignedRider
        ? "Route map will appear when pickup & drop coordinates are available."
        : "Pickup and drop coordinates are needed to show the route."}
    </div>
  );

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
      <div className="person-ride-typo flex h-full min-h-0 flex-1 flex-col gap-3 text-[12px] text-slate-700 md:text-[13px] lg:flex-row lg:gap-4">
        <div className="w-full min-w-0 space-y-3 bg-[#F8FAFC] lg:min-h-0 lg:flex-[4] lg:overflow-y-auto lg:overscroll-y-contain lg:pr-3">
          <ParcelOrderHeader
            order={order}
            tickets={tickets}
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            routedToLabel={routedToLabel}
          />

          <div className="space-y-3 pt-1">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <CaptainCard
                captain={captain}
                fallbackName={order.riderName}
                fallbackMobile={order.riderMobile}
                ratings={ratings}
                orderId={order.id}
                riderId={order.riderId}
              />
              <SenderCard order={order} />
              <ReceiverCard order={order} />
              <PackageCard order={order} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ParcelFareSummaryCard order={order} paymentDetail={paymentDetail} />
              <div className="min-h-[200px]">{mapBlock}</div>
            </div>

            <ParcelTripDetailsCard order={order} />
          </div>
        </div>

        <div className="w-full min-w-0 space-y-3 bg-[#F8FAFC] lg:min-h-0 lg:w-[320px] lg:max-w-[320px] lg:flex-none lg:overflow-y-auto lg:overscroll-y-contain lg:pl-2 xl:w-[360px] xl:max-w-[360px]">
          <ParcelRightSidebar
            order={order}
            stamps={stamps}
            onCreateRefund={() => setRefundModalOpen(true)}
            refundDisabled={refundLock.noActionsLeft}
            refundDisabledReason={refundLock.disabledReason}
            refunds={orderRefunds}
            onRoutedTo={applyRoutedTo}
          />
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
    </>
  );
}

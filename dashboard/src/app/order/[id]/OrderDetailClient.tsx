"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import OrderTimeline, { type OrderTimelineEntry } from "./OrderTimeline";
import OrderRightSidebar from "./OrderRightSidebar";
import CustomerDetails from "./CustomerDetails";
import MerchantDetails from "./MerchantDetails";
import PaymentDetails from "./PaymentDetails";
import RiderDetails from "./RiderDetails";
import RiderRouteMap from "./RiderRouteMap";
import { useUserEmail } from "@/hooks/queries/useAuthQuery";
import { ChevronDown, History, X } from "lucide-react";

/** Status options for "Update order status" modal (value = DB enum) */
const STATUS_OPTIONS = [
  { value: "picked_up" as const, label: "Dispatch Ready" },
  { value: "in_transit" as const, label: "Dispatched" },
  { value: "delivered" as const, label: "Delivered" },
] as const;

const STATUS_TO_LABEL: Record<string, string> = {
  picked_up: "Dispatch Ready",
  in_transit: "Dispatched",
  delivered: "Delivered",
};

/** Single entry from GET /api/orders/core statusHistory (manual status updates). */
export interface OrderStatusHistoryEntry {
  toStatus: string;
  updatedByEmail: string;
  createdAt: string;
}

interface OrderDetail {
  id: number;
  formattedOrderId: string | null;
  orderId: string | null;
  orderType: string;
  orderSource: string | null;
  status: string;
  currentStatus: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  fareAmount: number | null;
  itemTotal: number | null;
  addonTotal: number | null;
  grandTotal: number | null;
  tipAmount: number | null;
  totalAmount: number | null;
  routedToEmail: string | null;
  createdAt: string;
  updatedAt: string;
  customerId: number | null;
  customerExternalId: string | null;
  customerEmail: string | null;
  customerAccountStatus: string | null;
  customerRiskFlag: string | null;
  customerName: string | null;
  customerMobile: string | null;
  riderId?: number | null;
  riderName: string | null;
  riderMobile: string | null;
  dropAddressRaw: string | null;
  dropAddressNormalized?: string | null;
  dropAddressGeocoded?: string | null;
  pickupLat?: number | null;
  pickupLon?: number | null;
  dropLat?: number | null;
  dropLon?: number | null;
  pickupAddressDeviationMeters?: number | null;
  dropAddressDeviationMeters?: number | null;
  distanceMismatchFlagged?: boolean;
  distanceKm?: number | null;
  merchantStoreId: number | null;
  merchantParentId: number | null;
  /** Email of last user who manually updated order status. */
  manualStatusUpdatedByEmail?: string | null;
  /** Delivery instructions from orders_food (food orders only). */
  deliveryInstructions?: string | null;
  /** ETA in seconds from creation (for timeline). */
  etaSeconds?: number | null;
  /** Expected delivery timestamp (for timeline ETA labels). */
  estimatedDeliveryTime?: string | null;
  /** First ETA when order accepted (sidebar "First ETA"). */
  firstEtaAt?: string | null;
  /** When ETA was first breached (from DB). */
  etaBreachedAt?: string | null;
  /** order_timelines.id of stage current when ETA was first breached (red dot). */
  etaBreachedTimelineId?: number | null;
}

/** Merchant summary from order API for MX card (show immediately on load) */
interface MerchantSummaryFromApi {
  parentMerchantId: string | null;
  parentName: string | null;
  storeCode: string | null;
  internalStoreId: number | null;
  storeName: string | null;
  phones: string[] | null;
  is24Hours: boolean;
  schedule: Record<
    string,
    { open: boolean; slot1Start: string | null; slot1End: string | null; slot2Start: string | null; slot2End: string | null }
  > | null;
  city?: string | null;
  locality?: string | null;
  fullAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  merchantType?: string | null;
  assignedUserEmail?: string | null;
  assignedUserDepartment?: string | null;
}

/** Refund list item from GET /api/orders/[id]/refunds */
export interface OrderRefundListItem {
  id: number;
  orderId: number;
  refundType: string;
  refundReason: string;
  refundDescription: string | null;
  refundAmount: string;
  refundStatus: string | null;
  refundInitiatedBy: string | null;
  refundInitiatedById: number | null;
  initiatedByEmail: string | null;
  createdAt: string;
  processedAt: string | null;
  completedAt: string | null;
}

interface OrderTicketSummary {
  id: number;
  ticketNumber: string;
  status: string;
  subject: string;
  createdAt: string;
  ticketSource?: string;
  resolvedByName?: string | null;
  resolvedByEmail?: string | null;
}

function toMerchantProfile(summary: MerchantSummaryFromApi) {
  return {
    parentMerchantId: summary.parentMerchantId,
    parentName: summary.parentName,
    storeCode: summary.storeCode,
    internalStoreId: summary.internalStoreId,
    storeName: summary.storeName,
    phones: summary.phones,
    is24Hours: summary.is24Hours,
    schedule: summary.schedule,
    city: summary.city ?? null,
    locality: summary.locality ?? null,
    fullAddress: summary.fullAddress ?? null,
    latitude: summary.latitude ?? null,
    longitude: summary.longitude ?? null,
    merchantType: summary.merchantType ?? null,
    assignedUserEmail: summary.assignedUserEmail ?? null,
    assignedUserDepartment: summary.assignedUserDepartment ?? null,
  };
}

function InfinitySpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <svg
        width="96"
        height="48"
        viewBox="0 0 96 48"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Base infinity shape - light gray for white bg */}
        <path
          d="M12 24C12 17.3726 17.3726 12 24 12C32 12 36.5 17 48 24C59.5 31 64 36 72 36C78.6274 36 84 30.6274 84 24C84 17.3726 78.6274 12 72 12C64 12 59.5 17 48 24C36.5 31 32 36 24 36C17.3726 36 12 30.6274 12 24Z"
          stroke="#e2e8f0"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Animated segment - page theme (emerald) */}
        <path
          d="M12 24C12 17.3726 17.3726 12 24 12C32 12 36.5 17 48 24C59.5 31 64 36 72 36C78.6274 36 84 30.6274 84 24C84 17.3726 78.6274 12 72 12C64 12 59.5 17 48 24C36.5 31 32 36 24 36C17.3726 36 12 30.6274 12 24Z"
          stroke="#10b981"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="60 160"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="0;220"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
      <p className="text-sm font-medium text-slate-500">
        Loading order details…
      </p>
    </div>
  );
}

interface OrderDetailClientProps {
  orderPublicId: string;
  onLoadingChange?: (loading: boolean) => void;
}

export default function OrderDetailClient({ orderPublicId, onLoadingChange }: OrderDetailClientProps) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [merchantSummary, setMerchantSummary] = useState<MerchantSummaryFromApi | null>(null);
  const [initialRemarksCount, setInitialRemarksCount] = useState<number>(0);
  const [initialReconsCount, setInitialReconsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<
    "picked_up" | "in_transit" | "delivered"
  >("picked_up");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [orderRefunds, setOrderRefunds] = useState<OrderRefundListItem[]>([]);
  const [orderTickets, setOrderTickets] = useState<OrderTicketSummary[]>([]);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [statusHistory, setStatusHistory] = useState<OrderStatusHistoryEntry[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [timelineEntries, setTimelineEntries] = useState<OrderTimelineEntry[] | null>(null);
  const loggedInEmail = useUserEmail();

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (!order?.id) {
      setOrderTickets([]);
      return;
    }

    let cancelled = false;
    fetch(`/api/orders/${order.id}/tickets`)
      .then((res) => res.json())
      .then((body: { success?: boolean; data?: OrderTicketSummary[] }) => {
        if (cancelled) return;
        if (body?.success && Array.isArray(body.data)) {
          setOrderTickets(body.data);
        } else {
          setOrderTickets([]);
        }
      })
      .catch(() => {
        if (!cancelled) setOrderTickets([]);
      });

    return () => {
      cancelled = true;
    };
  }, [order?.id]);

  useEffect(() => {
    let cancelled = false;

    if (!orderPublicId) {
      setOrder(null);
      setTimelineEntries(null);
      setError("Invalid order ID.");
      setLoading(false);
      return;
    }

    if (refetchTrigger === 0) setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      orderType: "food",
      searchType: "Order Id",
      search: orderPublicId,
      limit: "1",
    });

    const orderIdForParallel = refetchTrigger > 0 && order?.id ? order.id : null;

    const fetchOrder = fetch(`/api/orders/core?${params.toString()}`).then((res) => res.json());
    const fetchTimeline =
      orderIdForParallel != null
        ? fetch(`/api/orders/${orderIdForParallel}/timeline`).then((res) => res.json().catch(() => null))
        : Promise.resolve(null);

    Promise.all([fetchOrder, orderIdForParallel != null ? fetchTimeline : Promise.resolve(null)])
      .then(async ([body, timelineBodyOrNull]) => {
        if (cancelled) return;
        let timelineBody = timelineBodyOrNull;
        if (timelineBody == null && body?.success && Array.isArray(body?.data) && body.data.length > 0) {
          const row = body.data[0] as any;
          timelineBody = await fetch(`/api/orders/${row.id}/timeline`).then((r) => r.json().catch(() => null));
        }
        if (body.success && Array.isArray(body.data) && body.data.length > 0) {
          const row = body.data[0] as any;
          const timeline =
            timelineBody?.success && Array.isArray(timelineBody?.data)
              ? (timelineBody.data as OrderTimelineEntry[])
              : [];
          if (cancelled) return;
          if (body.merchantSummary != null && typeof body.merchantSummary === "object") {
            setMerchantSummary(body.merchantSummary as MerchantSummaryFromApi);
          } else {
            setMerchantSummary(null);
          }
          setInitialRemarksCount(
            typeof body.remarksCount === "number" && body.remarksCount >= 0 ? body.remarksCount : 0
          );
          setInitialReconsCount(
            typeof body.reconsCount === "number" && body.reconsCount >= 0 ? body.reconsCount : 0
          );
          if (Array.isArray(body.statusHistory)) {
            setStatusHistory(
              body.statusHistory.map((h: { toStatus: string; updatedByEmail: string; createdAt: string }) => ({
                toStatus: h.toStatus,
                updatedByEmail: h.updatedByEmail,
                createdAt: h.createdAt,
              }))
            );
          } else {
            setStatusHistory([]);
          }

          const toNumberOrNull = (v: unknown): number | null => {
            if (v === null || v === undefined) return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };

          setTimelineEntries(timeline);
          setOrder({
            id: row.id,
            formattedOrderId: row.formattedOrderId,
            orderId: row.orderId,
            orderType: row.orderType ?? "food",
            orderSource: row.orderSource ?? null,
            status: row.status,
            currentStatus: row.currentStatus,
            paymentStatus: row.paymentStatus,
            paymentMethod: row.paymentMethod ?? null,
            fareAmount: toNumberOrNull(row.fareAmount),
            itemTotal: toNumberOrNull(row.itemTotal),
            addonTotal: toNumberOrNull(row.addonTotal),
            grandTotal: toNumberOrNull(row.grandTotal),
            tipAmount: toNumberOrNull(row.tipAmount),
            totalAmount:
              toNumberOrNull(row.grandTotal) ??
              toNumberOrNull(row.fareAmount) ??
              null,
            routedToEmail: row.routedToEmail ?? null,
            customerId: row.customerId ?? null,
            customerExternalId: row.customerExternalId ?? null,
            customerEmail: row.customerEmail ?? null,
            customerAccountStatus: row.customerAccountStatus ?? null,
            customerRiskFlag: row.customerRiskFlag ?? null,
            customerName: row.customerName,
            customerMobile: row.customerMobile,
            riderId: row.riderId ?? null,
            riderName: row.riderName,
            riderMobile: row.riderMobile,
            dropAddressRaw: row.dropAddressRaw,
            dropAddressNormalized: row.dropAddressNormalized ?? null,
            dropAddressGeocoded: row.dropAddressGeocoded ?? null,
            pickupLat: row.pickupLat ?? null,
            pickupLon: row.pickupLon ?? null,
            dropLat: row.dropLat ?? null,
            dropLon: row.dropLon ?? null,
            pickupAddressDeviationMeters: row.pickupAddressDeviationMeters ?? null,
            dropAddressDeviationMeters: row.dropAddressDeviationMeters ?? null,
            distanceMismatchFlagged: row.distanceMismatchFlagged ?? false,
            distanceKm: row.distanceKm ?? null,
            merchantStoreId: row.merchantStoreId,
            merchantParentId: row.merchantParentId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            manualStatusUpdatedByEmail: row.manualStatusUpdatedByEmail ?? null,
            deliveryInstructions: row.deliveryInstructions ?? null,
            etaSeconds: row.etaSeconds ?? null,
            estimatedDeliveryTime: row.estimatedDeliveryTime != null ? String(row.estimatedDeliveryTime) : null,
            firstEtaAt: row.firstEtaAt != null ? String(row.firstEtaAt) : null,
            etaBreachedAt: row.etaBreachedAt != null ? String(row.etaBreachedAt) : null,
            etaBreachedTimelineId: row.etaBreachedTimelineId != null ? Number(row.etaBreachedTimelineId) : null,
          });

          // Load refunds in the same initial load, so payment card stats
          // appear together with the rest of the order details.
          try {
            const refundsRes = await fetch(`/api/orders/${row.id}/refunds`);
            const refundsBody = await refundsRes.json().catch(() => null);
            if (!cancelled && refundsRes.ok && refundsBody?.success && Array.isArray(refundsBody.data)) {
              setOrderRefunds(refundsBody.data as OrderRefundListItem[]);
            } else if (!cancelled) {
              setOrderRefunds([]);
            }
          } catch {
            if (!cancelled) setOrderRefunds([]);
          }

          // Load tickets for this order via order-scoped API (uses ORDER_FOOD access, not TICKET)
          if (!cancelled && row.id != null && Number.isFinite(Number(row.id))) {
            fetch(`/api/orders/${row.id}/tickets`)
              .then((res) => res.json())
              .then((ticketBody: { success?: boolean; data?: OrderTicketSummary[] }) => {
                if (ticketBody?.success && Array.isArray(ticketBody.data)) {
                  setOrderTickets(ticketBody.data);
                } else {
                  setOrderTickets([]);
                }
              })
              .catch(() => setOrderTickets([]));
          } else {
            setOrderTickets([]);
          }
        } else {
          setMerchantSummary(null);
          setInitialRemarksCount(0);
          setInitialReconsCount(0);
          setStatusHistory([]);
          setTimelineEntries(null);
          setError("Order not found.");
          setOrderRefunds([]);
          setOrderTickets([]);
        }
      })
      .catch(() => !cancelled && setError("Failed to load order."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [orderPublicId, refetchTrigger]);

  const openStatusModal = useCallback(() => {
    const status = order?.status?.toLowerCase();
    if (status === "cancelled" || status === "rejected") return;
    if (
      status === "picked_up" ||
      status === "in_transit" ||
      status === "delivered"
    ) {
      setSelectedStatus(status);
    } else {
      setSelectedStatus("picked_up");
    }
    setShowStatusModal(true);
  }, [order?.status]);

  const submitStatusUpdate = useCallback(async () => {
    if (!order?.id || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setShowStatusModal(false);
        // Optimistic update: show new status and timeline entry instantly
        setOrder((prev) =>
          prev
            ? { ...prev, status: selectedStatus, currentStatus: selectedStatus }
            : prev
        );
        setTimelineEntries((prev) => {
          const newEntry: OrderTimelineEntry = {
            id: -Date.now(),
            orderId: order.id,
            status: selectedStatus,
            previousStatus: order.status ?? null,
            actorType: "system",
            actorId: null,
            actorName: null,
            statusMessage: null,
            occurredAt: new Date().toISOString(),
          };
          return [...(prev ?? []), newEntry];
        });
        setRefetchTrigger((t) => t + 1);
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [order?.id, selectedStatus, isUpdatingStatus]);

  const displayId = useMemo(
    () =>
      order
        ? order.formattedOrderId ?? order.orderId ?? `GMF${order.id.toString().padStart(6, "0")}`
        : "—",
    [order]
  );

  if (loading) {
    return (
      <div
        className="flex h-[calc(100vh-56px)] w-full items-center justify-center bg-slate-50"
        aria-busy="true"
        aria-label="Loading order details"
      >
        <InfinitySpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
        {error}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Order not found.
      </div>
    );
  }

  const statusLabel = order.currentStatus ?? order.status;
  const createdLabel = order.createdAt
    ? new Date(order.createdAt).toLocaleString()
    : "—";
  const updatedLabel = order.updatedAt
    ? new Date(order.updatedAt).toLocaleString()
    : "—";

  const rawId = displayId === "—" ? "" : String(displayId);
  const normalizedId = rawId.replace(/^#/, "");
  const idPrefix = normalizedId.length > 4 ? normalizedId.slice(0, -4) : normalizedId;
  const idLast4 = normalizedId.length > 4 ? normalizedId.slice(-4) : "";
  const idLast4Chars = idLast4.split("");

  const orderStatusLabel = statusLabel
    ? statusLabel
        .toString()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

  const statusForChip = (statusLabel ?? "").toString().toLowerCase();

  const orderStatusChipClasses = (() => {
    if (statusForChip === "delivered")
      return "bg-emerald-100 border-emerald-300 text-emerald-900";
    if (statusForChip === "cancelled")
      return "bg-sky-200 border-sky-300 text-sky-900";
    if (statusForChip === "failed")
      return "bg-red-50 border-red-200 text-red-800";
    if (["in_transit", "picked_up"].includes(statusForChip))
      return "bg-amber-50 border-amber-200 text-amber-800";
    if (["assigned", "accepted", "reached_store"].includes(statusForChip))
      return "bg-sky-50 border-sky-200 text-sky-800";
    return "bg-slate-100 border-slate-200 text-slate-700";
  })();

  // For the dropdown trigger, show current status label or "Select Option".
  const dbStatus = (order.status ?? "").toString().toLowerCase();
  const statusOptionMatch = STATUS_OPTIONS.find((opt) => opt.value === dbStatus);
  const statusButtonLabel = statusOptionMatch ? statusOptionMatch.label : "Select Option";
  const isOrderCancelledOrRejected = dbStatus === "cancelled" || dbStatus === "rejected";

  // Status rules: no status can be marked twice; flow follows progression.
  // Dispatch Ready (current): Dispatched & Delivered active; Dispatch Ready not selectable again.
  // Dispatched (current): Delivered active; Dispatch Ready & Dispatched disabled.
  // Delivered (current): all options and Update button disabled.
  const isOptionDisabled = (value: "picked_up" | "in_transit" | "delivered") => {
    if (dbStatus === "delivered") return true;
    if (dbStatus === "in_transit") return value === "picked_up" || value === "in_transit";
    if (dbStatus === "picked_up") return value === "picked_up";
    return false;
  };
  const isUpdateStatusButtonDisabled = dbStatus === "delivered";

  const lastStatusUpdaterEmail = order.manualStatusUpdatedByEmail?.trim() || null;
  const hasManualStatusUpdate = !!lastStatusUpdaterEmail;

  const orderCategoryLabel =
    order.orderType === "parcel"
      ? "Parcel"
      : order.orderType === "person_ride"
        ? "Person ride"
        : "Food";

  const orderSourceLabel =
    order.orderSource === "internal" || !order.orderSource
      ? "Customer app"
      : order.orderSource.charAt(0).toUpperCase() + order.orderSource.slice(1);

  const orderCategoryChipClasses = "bg-slate-100 border-slate-200 text-slate-700";
  const orderSourceChipClasses = "bg-slate-100 border-slate-200 text-slate-700";

  const effectiveRoutedTo = order.routedToEmail ?? null;

  const isLocationMismatch =
    Boolean(order.distanceMismatchFlagged) ||
    (order.pickupAddressDeviationMeters ?? 0) > 800 ||
    (order.dropAddressDeviationMeters ?? 0) > 800;

  const hasRiderRouteMap =
    order.pickupLat != null &&
    order.pickupLon != null &&
    order.dropLat != null &&
    order.dropLon != null &&
    Number.isFinite(order.pickupLat) &&
    Number.isFinite(order.pickupLon) &&
    Number.isFinite(order.dropLat) &&
    Number.isFinite(order.dropLon);

  const handleCopy = (text: string) => {
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  const handleCustomerPhoneClick = (title: string, phone: string) => {
    // Placeholder for future phone modal/logging
    console.log("[Customer phone click]", title, phone);
  };

  const handleCopyId = () => {
    if (!order || !normalizedId) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(normalizedId).catch(() => {
        // Swallow clipboard errors; copying is a convenience feature.
      });
    }
  };

  return (
    <>
      <div className="space-y-3 lg:space-y-0 lg:flex lg:items-start lg:justify-between lg:gap-4 text-[12px] md:text-[13px] text-slate-700">
      <div className="w-full lg:basis-[80%] lg:pr-3 space-y-3 lg:h-[calc(100vh-64px)] lg:overflow-y-auto">
        {/* Primary order summary just below main header */}
        <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-2 border-b border-slate-100">
          <div>
            <h1 className="flex items-center gap-1.5 text-[16px] font-medium text-slate-900">
              <span className="text-slate-700">#</span>
              <span className="font-mono text-[15px] text-emerald-700 tracking-wide">
                {idLast4
                  ? (
                      <>
                        <span>{idPrefix}</span>
                        <span className="font-medium text-[15px]">
                          {idLast4Chars[0]}
                        </span>
                        <span className="font-semibold text-[16px]">
                          {idLast4Chars[1]}
                        </span>
                        <span className="font-semibold text-[17px]">
                          {idLast4Chars[2]}
                        </span>
                        <span className="font-bold text-[18px]">
                          {idLast4Chars[3]}
                        </span>
                      </>
                    )
                  : normalizedId || "—"}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 bg-white text-[10px] text-slate-500 hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
                aria-label="Copy order ID"
              >
                <span>⧉</span>
              </button>
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-600">
              <span className="text-slate-800">{createdLabel}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-[11px]">
            {effectiveRoutedTo && (
              <p className="text-[11px] text-slate-500">
                Routed To:{" "}
                <span className="font-medium text-slate-800">
                  {effectiveRoutedTo}
                </span>
              </p>
            )}
          </div>
        </section>

        {/* Order status summary inline header */}
        <section className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            {orderTickets && orderTickets.length > 0 && (() => {
              const lastTicket = orderTickets[0];
              const statusLabel = lastTicket.status
                ? lastTicket.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                : "—";
              return (
                <button
                  type="button"
                  onClick={() => setShowTicketsModal(true)}
                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                    <span className="font-mono">{lastTicket.ticketNumber}</span>
                    <span className="text-emerald-600/80">·</span>
                    <span>{statusLabel}</span>
                  </span>
                  {orderTickets.length > 1 && (
                    <span className="text-[10px] text-slate-500">
                      +{orderTickets.length - 1} more
                    </span>
                  )}
                  <span className="ml-0.5 text-[10px] text-slate-500">▾</span>
                </button>
              );
            })()}
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-normal ${orderStatusChipClasses}`}
            >
              Order status:&nbsp;
              <span className="font-medium">{orderStatusLabel}</span>
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-normal ${orderCategoryChipClasses}`}
            >
              Order category:&nbsp;
              <span className="font-medium">{orderCategoryLabel}</span>
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-normal ${orderSourceChipClasses}`}
            >
              Order source:&nbsp;
              <span className="font-medium">{orderSourceLabel}</span>
            </span>
          </div>
          <div className="relative ml-auto flex items-center gap-2">
            {!hasManualStatusUpdate && (
              <span className="text-[11px] text-slate-500">Update order status</span>
            )}
            {hasManualStatusUpdate && (
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="inline-flex items-center gap-1.5 text-[12px] text-gati-text-primary cursor-pointer"
                title="View status history"
              >
                <span className="truncate max-w-[200px]">{lastStatusUpdaterEmail}</span>
                <span className="ml-1 text-[10px] text-slate-500 shrink-0">▾</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => !isOrderCancelledOrRejected && openStatusModal()}
              disabled={isOrderCancelledOrRejected}
              className="inline-flex h-6 min-h-0 items-center gap-1 rounded border border-slate-200 bg-white pl-2 pr-1.5 text-[11px] leading-tight text-slate-700 shadow-sm transition focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white"
              title={isOrderCancelledOrRejected ? "Order is cancelled" : "Update order status"}
            >
              {statusButtonLabel}
              <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
            </button>
            {showStatusModal && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/20"
                  aria-hidden
                  onClick={() => setShowStatusModal(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] w-max max-w-[14rem] rounded-md border border-slate-200 bg-white py-1.5 px-1.5 shadow-lg" role="dialog" aria-label="Update order status">
                  <p className="px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    Update order status
                  </p>
                  <div className="space-y-0">
                    {STATUS_OPTIONS.map((opt) => {
                      const disabled = isOptionDisabled(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-2 px-2 py-1 rounded ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-50"}`}
                        >
                          <input
                            type="radio"
                            name="orderStatus"
                            value={opt.value}
                            checked={selectedStatus === opt.value}
                            onChange={() => !disabled && setSelectedStatus(opt.value)}
                            disabled={disabled}
                            className="h-3 w-3 border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
                          />
                          <span className="text-[11px] text-slate-800">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-1 border-t border-slate-100 pt-1.5 px-1">
                    <button
                      type="button"
                      onClick={submitStatusUpdate}
                      disabled={isUpdatingStatus || isUpdateStatusButtonDisabled}
                      className="flex w-full items-center justify-center gap-1 rounded-md bg-emerald-500 px-2 py-1.5 text-[11px] font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isUpdatingStatus ? (
                        <>
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-r-transparent" />
                          Updating...
                        </>
                      ) : (
                        "Update Status"
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Order progress timeline (event-driven from order_timelines, loaded with order = no spinner) */}
        <div className="mt-2 mb-1">
          <OrderTimeline
            orderId={order.id}
            initialEntries={timelineEntries}
            currentStatus={statusLabel || undefined}
            orderCreatedAt={order.createdAt ? new Date(order.createdAt) : undefined}
            etaAt={(() => {
              if (order.estimatedDeliveryTime)
                return new Date(order.estimatedDeliveryTime);
              if (order.etaSeconds != null && order.createdAt)
                return new Date(new Date(order.createdAt).getTime() + Number(order.etaSeconds) * 1000);
              const entries = timelineEntries ?? [];
              const withEta = entries.filter((e) => e.expectedByAt);
              if (withEta.length > 0) {
                const latest = withEta[withEta.length - 1];
                const t = latest.expectedByAt;
                if (t) return new Date(t);
              }
              return undefined;
            })()}
            etaBreachedTimelineId={order.etaBreachedTimelineId ?? undefined}
          />
        </div>

        {/* Main info sections */}
        <div className="mt-3 space-y-3">
          {/* Main grid of sections */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {/* Customer card */}
            <CustomerDetails
              order={{
                userId: order.customerExternalId ?? order.customerId ?? order.id,
                customerLatLon:
                  order.dropLat != null && order.dropLon != null
                    ? `${order.dropLat}, ${order.dropLon}`
                    : null,
                customerName: order.customerName,
                customerMobile: order.customerMobile,
                customerEmail: order.customerEmail,
                customerAddress: order.dropAddressNormalized ?? order.dropAddressRaw,
                dropAddressRaw: order.dropAddressRaw,
                dropAddressNormalized: order.dropAddressNormalized,
                dropAddressGeocoded: order.dropAddressGeocoded,
                userType: order.customerAccountStatus ?? "Customer",
                locationMismatch: isLocationMismatch,
                accountStatus: order.customerAccountStatus,
                riskFlag: order.customerRiskFlag,
              }}
              onCopy={handleCopy}
              onPhoneClick={handleCustomerPhoneClick}
            />

            {/* Merchant card */}
            <MerchantDetails
              merchant={{
                storeId: order.merchantStoreId,
                parentId: order.merchantParentId,
                pickupLat: order.pickupLat ?? null,
                pickupLon: order.pickupLon ?? null,
                orderIdLabel: displayId,
                orderPaidAtLabel: createdLabel,
              }}
              initialProfile={merchantSummary ? toMerchantProfile(merchantSummary) : undefined}
              onCopy={handleCopy}
            />

            {/* Payment details */}
            <PaymentDetails order={order} displayId={displayId} orderRefunds={orderRefunds} />
          </div>

          {/* Rider details + map */}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <RiderDetails
              order={{
                riderName: order.riderName,
                riderMobile: order.riderMobile,
                riderProvider: order.orderSource,
                trackingOrderId: displayId,
                trackingUrl: null,
                otp: null,
                status: order.status,
                currentStatus: order.currentStatus,
                createdAt: order.createdAt,
                distanceKm: order.distanceKm ?? null,
              }}
              onCopy={handleCopy}
              onPhoneClick={handleCustomerPhoneClick}
            />
            {hasRiderRouteMap && (
              <RiderRouteMap
                pickupLat={order.pickupLat ?? null}
                pickupLon={order.pickupLon ?? null}
                dropLat={order.dropLat ?? null}
                dropLon={order.dropLon ?? null}
              />
            )}
          </div>
        </div>
      </div>

        {/* Right sidebar */}
      <div className="w-full lg:basis-[20%] lg:pl-2 lg:h-[calc(100vh-64px)] lg:overflow-y-auto">
        <OrderRightSidebar
          order={order}
          orderRefunds={orderRefunds}
          initialRemarksCount={initialRemarksCount}
          initialReconsCount={initialReconsCount}
          onRoutedToChange={(email) =>
            setOrder((prev) => (prev ? { ...prev, routedToEmail: email } : prev))
          }
          onRefundCreated={() => setRefetchTrigger((t) => t + 1)}
        />
      </div>
    </div>

    {showHistoryModal && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHistoryModal(false);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-lg max-w-md w-full p-4 text-[12px] text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-emerald-500" />
                <h2 className="text-xs font-semibold text-slate-900">Order status history</h2>
              </div>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                onClick={() => setShowHistoryModal(false)}
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {statusHistory.length === 0 ? (
              <p className="text-[11px] text-slate-500 py-4">No manual status updates yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-4 font-semibold text-slate-700">Status</th>
                      <th className="py-2 pr-4 font-semibold text-slate-700">Date & time</th>
                      <th className="py-2 font-semibold text-slate-700">Updated by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusHistory.map((entry, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 pr-4 font-medium text-slate-800">
                          {STATUS_TO_LABEL[entry.toStatus] ?? entry.toStatus.replace(/_/g, " ")}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 text-slate-600 truncate max-w-[200px]" title={entry.updatedByEmail}>
                          {entry.updatedByEmail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    {showTicketsModal && orderTickets && orderTickets.length > 0 && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTicketsModal(false);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-lg max-w-lg w-full p-5 text-[12px] text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Routed Tickets</h2>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                onClick={() => setShowTicketsModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {orderTickets.map((t) => {
                const subjectWithoutHash = (t.subject ?? "").replace(/\s*\(#\d+\)\s*$/i, "").trim();
                const sourceLabel = t.ticketSource
                  ? t.ticketSource.replace(/\b\w/g, (c) => c.toUpperCase())
                  : null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-md border border-slate-100 hover:bg-slate-50 flex flex-col gap-0.5 cursor-pointer"
                    onClick={() => {
                      window.open(`/dashboard/tickets/${t.id}`, "_blank");
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-emerald-700">
                        {t.ticketNumber}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {sourceLabel && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            {sourceLabel}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500">
                          {new Date(t.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {subjectWithoutHash && (
                      <p className="text-[11px] text-slate-700 truncate">
                        {subjectWithoutHash}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500 capitalize">
                      Status: {t.status || "unknown"}
                      {(t.resolvedByEmail ?? t.resolvedByName) ? (
                        <>
                          {" · "}
                          <span className="text-slate-600">
                            Updated by:{" "}
                            <span className="font-medium text-slate-700">
                              {t.resolvedByEmail && t.resolvedByName
                                ? `${t.resolvedByEmail} (${t.resolvedByName})`
                                : t.resolvedByEmail ?? t.resolvedByName}
                            </span>
                          </span>
                        </>
                      ) : null}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

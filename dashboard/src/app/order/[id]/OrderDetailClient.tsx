"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import OrderTimeline, { type OrderTimelineEntry } from "./OrderTimeline";
import OrderActionBanner from "./OrderActionBanner";
import OrderRightSidebar from "./OrderRightSidebar";
import {
  fetchOrderItemsCached,
  type OrderItemsPayload,
} from "@/lib/orderItemsPayload";
import { computeOrderItemQuantityCount } from "@/lib/merchantOrderFoodActions";
import CustomerDetails from "./CustomerDetails";
import MerchantDetails from "./MerchantDetails";
import PaymentDetails from "./PaymentDetails";
import type { OrderPaymentDetail } from "@/lib/orders/order-payment-types";
import RiderDetails from "./RiderDetails";
import type { RiderTimelineData } from "./RiderTimeline";
import type { OrderRiderTrackingPayload } from "@/lib/db/operations/order-rider-tracking";
import RiderRouteMap from "./RiderRouteMap";
import { useAuthOptional } from "@/providers/AuthProvider";
import { useIsActiveRoute } from "@/hooks/useIsActiveRoute";
import { usePageVisible } from "@/hooks/usePageVisible";
import { ChevronDown, History, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import type { OrderCancellationInfo } from "@/lib/merchant-cancellation-display";
import type { OrderCustomerFeedback } from "@/lib/orders/order-customer-feedback";
import {
  OrderCustomerFeedbackSideSheet,
  type FeedbackSheetTarget,
} from "./OrderCustomerFeedbackSideSheet";
import { OrderPartnerChatSideSheet } from "./OrderPartnerChatSideSheet";
import {
  isManualStatusOptionDisabled,
  canApplyManualStatusUpdate,
  resolveDispatchManualStage,
  MANUAL_STATUS_LABELS,
  type ManualStatusValue,
} from "@/lib/orders/order-dispatch-status";
import { resolveOrderActionBannerMessage } from "@/lib/orders/order-action-banner";
import {
  parseGeocodedLatLon,
  resolveMapCoordinatePair,
} from "@/lib/orders/parse-order-map-coords";
import { isHardPageReload } from "@/lib/navigation/is-hard-page-reload";
import { formatDeliveredByLabel } from "@/lib/orders/order-detail-display";
import {
  prefetchRiderActivityLog,
  seedRiderActivityLogCache,
  invalidateRiderActivityLogCache,
  fetchRiderActivityLogCached,
  type RiderActivityLogCacheEntry,
} from "@/lib/riderActivityLogCache";
import { prefetchCancellationCatalogClient } from "@/lib/orders/cancellation-catalog-client-cache";
import { prefetchPartnerChat, seedPartnerChatCache, type PartnerChatCacheEntry } from "@/lib/partnerChatCache";
import {
  mapNotificationsFromApi,
  mapReconsFromApi,
  mapRemarksFromApi,
  type SidebarCxNotification,
  type SidebarRecon,
  type SidebarRemark,
} from "@/lib/orders/order-sidebar-activity";
import { resolveOrderTypeFromPublicId } from "@/lib/orders/resolve-order-type-from-public-id";
import { hasOrderCancellationOnProgressTimeline } from "@/lib/orders/order-timeline-rider-filter";
import type { PersonRideOrderDetail } from "@/lib/orders/person-ride-order-types";
import PersonRideOrderSections from "./PersonRideOrderSections";
import { formatRiderOrderStatusDisplayLabel } from "@/lib/riders/rider-order-status-display";

/** Status options for "Update order status" modal (value = DB enum) */
const STATUS_OPTIONS = [
  { value: "picked_up" as const, label: MANUAL_STATUS_LABELS.picked_up },
  { value: "in_transit" as const, label: MANUAL_STATUS_LABELS.in_transit },
  { value: "delivered" as const, label: MANUAL_STATUS_LABELS.delivered },
] as const;

/** Single entry from GET /api/orders/core statusHistory (manual status updates). */
export interface OrderStatusHistoryEntry {
  toStatus: string;
  updatedByEmail: string;
  updatedByRole: string;
  createdAt: string;
}

type TimelineEntryFromApi = Omit<OrderTimelineEntry, "occurredAt" | "expectedByAt"> & {
  occurredAt?: unknown;
  expectedByAt?: unknown;
};

function normalizeTimelineAt(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function normalizeTimelineAtNullable(value: unknown): string | null {
  if (value == null) return null;
  return normalizeTimelineAt(value);
}

function mapTimelineEntries(raw: TimelineEntryFromApi[]): OrderTimelineEntry[] {
  return raw.map((e) => ({
    ...e,
    occurredAt: normalizeTimelineAt(e.occurredAt),
    expectedByAt: normalizeTimelineAtNullable(e.expectedByAt),
  }));
}

function parseStatusHistoryEntry(raw: unknown): OrderStatusHistoryEntry | null {
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

function AgentRoleBadge({ role }: { role: string }) {
  const label = role?.trim() || "AGENT";
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-700 whitespace-nowrap">
      {label}
    </span>
  );
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
  customerAlternateMobile: string | null;
  orderAlternateContactPhone: string | null;
  orderDeliveryPrimaryContactPhone: string | null;
  riderId?: number | null;
  riderName: string | null;
  riderMobile: string | null;
  dropAddressRaw: string | null;
  dropAddressNormalized?: string | null;
  dropAddressGeocoded?: string | null;
  pickupAddressRaw?: string | null;
  pickupAddressNormalized?: string | null;
  pickupAddressGeocoded?: string | null;
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
  /** orders_food.order_status — drives Dispatch Ready enablement with rider-at-store. */
  foodOrderStatus?: string | null;
  /** orders_food.dispatched_at — admin/rider dispatch timestamp. */
  dispatchedAt?: string | null;
  /** orders_food.rider_picked_up_at — rider physical pickup from store. */
  riderPickedUpAt?: string | null;
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
  /** From orders_core.placed_at or created_at */
  orderTimeIso?: string | null;
  orderTimeSource?: "placed_at" | "created_at";
  itemCount?: number | null;
  systemKptMinutes?: number | null;
  merchantUpdatedKptMinutes?: number | null;
  /** Cumulative minutes from merchant "Need more time". */
  merchantExtraPrepMinutes?: number | null;
  isScheduledOrder?: boolean;
  scheduledDeliverySummary?: string | null;
  deliveryType?: string | null;
  contactlessDelivery?: boolean | null;
  localityType?: string | null;
  localityIsSafe?: boolean | null;
  deliveredBy?: string | null;
  deliveryInitiator?: string | null;
  customerTrustTierLabel?: string | null;
  customerUserType?: string | null;
  customerFraudReasons?: string[];
  riderInstructionsList?: string[];
  merchantInstructionsList?: string[];
  cancellationInfo?: OrderCancellationInfo | null;
  pickupOtp?: string | null;
  rtoOtp?: string | null;
  deliveryOtp?: string | null;
  customerFeedback?: OrderCustomerFeedback | null;
  storePrepDelaySeconds?: number | null;
  storePrepDelayLive?: boolean;
  storePrepDelayAnchorAt?: string | null;
  storePrepDelayWasLate?: boolean;
  riderRestaurantWaitSeconds?: number | null;
  riderRestaurantWaitLive?: boolean;
  riderRestaurantWaitAnchorAt?: string | null;
  deliveryProofImageUrl?: string | null;
  rideDetail?: PersonRideOrderDetail | null;
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
  approval_status?: string | null;
  operational_status?: string | null;
  is_active?: boolean | null;
  is_accepting_orders?: boolean | null;
  is_available?: boolean | null;
  deleted_at?: string | null;
  delisted_at?: string | null;
}

/** Penalty / debit / credit record from GET /api/orders/[id]/recovery-records */
export interface OrderRecoveryRecordItem {
  id: string;
  party: "rider" | "merchant";
  partyLabel: string;
  kind: string;
  reason: string | null;
  amount: number;
  impact: "debit" | "credit" | "info";
  status: string | null;
  createdAt: string | null;
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
    approval_status: summary.approval_status ?? null,
    operational_status: summary.operational_status ?? null,
    is_active: summary.is_active ?? null,
    is_accepting_orders: summary.is_accepting_orders ?? null,
    is_available: summary.is_available ?? null,
    deleted_at: summary.deleted_at ?? null,
    delisted_at: summary.delisted_at ?? null,
  };
}

function normalizeOrderPublicId(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[-\s]/g, "")
    .toUpperCase();
}

function orderMatchesPublicId(order: OrderDetail, publicId: string): boolean {
  const target = normalizeOrderPublicId(publicId);
  if (!target) return false;
  const candidates = [
    order.formattedOrderId,
    order.orderId,
    order.id != null ? `GMF${String(order.id).padStart(6, "0")}` : null,
    order.id != null ? String(order.id) : null,
  ];
  return candidates.some((c) => c != null && normalizeOrderPublicId(String(c)) === target);
}

function toNumberOrNullFromApi(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapOrderCoreApiRowToDetail(row: Record<string, unknown>): OrderDetail {
  const toNumberOrNull = toNumberOrNullFromApi;
  return {
    id: row.id as number,
    formattedOrderId: row.formattedOrderId as string | null,
    orderId: row.orderId as string | null,
    orderType: (row.orderType as string | undefined) ?? "food",
    orderSource: (row.orderSource as string | null) ?? null,
    status: row.status as string,
    currentStatus: row.currentStatus as string | null,
    paymentStatus: row.paymentStatus as string | null,
    paymentMethod: (row.paymentMethod as string | null) ?? null,
    fareAmount: toNumberOrNull(row.fareAmount),
    itemTotal: toNumberOrNull(row.itemTotal),
    addonTotal: toNumberOrNull(row.addonTotal),
    grandTotal: toNumberOrNull(row.grandTotal),
    tipAmount: toNumberOrNull(row.tipAmount),
    totalAmount:
      toNumberOrNull(row.grandTotal) ?? toNumberOrNull(row.fareAmount) ?? null,
    routedToEmail: (row.routedToEmail as string | null) ?? null,
    customerId: (row.customerId as number | null) ?? null,
    customerExternalId: (row.customerExternalId as string | null) ?? null,
    customerEmail: (row.customerEmail as string | null) ?? null,
    customerAccountStatus: (row.customerAccountStatus as string | null) ?? null,
    customerRiskFlag: (row.customerRiskFlag as string | null) ?? null,
    customerName: row.customerName as string | null,
    customerMobile: row.customerMobile as string | null,
    customerAlternateMobile: (row.customerAlternateMobile as string | null) ?? null,
    orderAlternateContactPhone: (row.orderAlternateContactPhone as string | null) ?? null,
    orderDeliveryPrimaryContactPhone:
      (row.orderDeliveryPrimaryContactPhone as string | null) ?? null,
    riderId: (row.riderId as number | null) ?? null,
    riderName: row.riderName as string | null,
    riderMobile: row.riderMobile as string | null,
    dropAddressRaw: row.dropAddressRaw as string | null,
    dropAddressNormalized: (row.dropAddressNormalized as string | null) ?? null,
    dropAddressGeocoded: (row.dropAddressGeocoded as string | null) ?? null,
    pickupAddressRaw: (row.pickupAddressRaw as string | null) ?? null,
    pickupAddressNormalized: (row.pickupAddressNormalized as string | null) ?? null,
    pickupAddressGeocoded: (row.pickupAddressGeocoded as string | null) ?? null,
    pickupLat: toNumberOrNull(row.pickupLat),
    pickupLon: toNumberOrNull(row.pickupLon),
    dropLat: toNumberOrNull(row.dropLat),
    dropLon: toNumberOrNull(row.dropLon),
    pickupAddressDeviationMeters: (row.pickupAddressDeviationMeters as number | null) ?? null,
    dropAddressDeviationMeters: (row.dropAddressDeviationMeters as number | null) ?? null,
    distanceMismatchFlagged: Boolean(row.distanceMismatchFlagged),
    distanceKm: (row.distanceKm as number | null) ?? null,
    merchantStoreId: row.merchantStoreId as number | null,
    merchantParentId: row.merchantParentId as number | null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    manualStatusUpdatedByEmail: (row.manualStatusUpdatedByEmail as string | null) ?? null,
    foodOrderStatus: typeof row.foodOrderStatus === "string" ? row.foodOrderStatus : null,
    dispatchedAt: row.dispatchedAt != null ? String(row.dispatchedAt) : null,
    riderPickedUpAt: row.riderPickedUpAt != null ? String(row.riderPickedUpAt) : null,
    deliveryInstructions: (row.deliveryInstructions as string | null) ?? null,
    etaSeconds: (row.etaSeconds as number | null) ?? null,
    estimatedDeliveryTime:
      row.estimatedDeliveryTime != null ? String(row.estimatedDeliveryTime) : null,
    firstEtaAt: row.firstEtaAt != null ? String(row.firstEtaAt) : null,
    etaBreachedAt: row.etaBreachedAt != null ? String(row.etaBreachedAt) : null,
    etaBreachedTimelineId:
      row.etaBreachedTimelineId != null ? Number(row.etaBreachedTimelineId) : null,
    orderTimeIso: row.orderTimeIso != null ? String(row.orderTimeIso) : null,
    orderTimeSource: row.orderTimeSource === "placed_at" ? "placed_at" : "created_at",
    itemCount: row.itemCount != null ? Number(row.itemCount) : null,
    systemKptMinutes: row.systemKptMinutes != null ? Number(row.systemKptMinutes) : null,
    merchantUpdatedKptMinutes:
      row.merchantUpdatedKptMinutes != null ? Number(row.merchantUpdatedKptMinutes) : null,
    merchantExtraPrepMinutes:
      row.merchantExtraPrepMinutes != null ? Number(row.merchantExtraPrepMinutes) : null,
    isScheduledOrder: Boolean(row.isScheduledOrder),
    scheduledDeliverySummary:
      row.scheduledDeliverySummary != null ? String(row.scheduledDeliverySummary) : null,
    deliveryType: row.deliveryType != null ? String(row.deliveryType) : null,
    contactlessDelivery:
      row.contactlessDelivery === true
        ? true
        : row.contactlessDelivery === false
          ? false
          : null,
    localityType: row.localityType != null ? String(row.localityType) : null,
    localityIsSafe:
      row.localityIsSafe === true ? true : row.localityIsSafe === false ? false : null,
    deliveredBy: row.deliveredBy != null ? String(row.deliveredBy) : null,
    deliveryInitiator: row.deliveryInitiator != null ? String(row.deliveryInitiator) : null,
    customerTrustTierLabel:
      row.customerTrustTierLabel != null ? String(row.customerTrustTierLabel) : null,
    customerUserType:
      row.customerUserType != null
        ? String(row.customerUserType)
        : row.customerTrustTierLabel != null
          ? String(row.customerTrustTierLabel)
          : null,
    customerFraudReasons: Array.isArray(row.customerFraudReasons)
      ? (row.customerFraudReasons as string[])
      : [],
    riderInstructionsList: Array.isArray(row.riderInstructionsList)
      ? (row.riderInstructionsList as string[])
      : [],
    merchantInstructionsList: Array.isArray(row.merchantInstructionsList)
      ? (row.merchantInstructionsList as string[])
      : [],
    cancellationInfo:
      row.cancellationInfo && typeof row.cancellationInfo === "object"
        ? (row.cancellationInfo as OrderCancellationInfo)
        : null,
    pickupOtp:
      row.pickupOtp != null && String(row.pickupOtp).trim()
        ? String(row.pickupOtp).trim()
        : null,
    rtoOtp:
      row.rtoOtp != null && String(row.rtoOtp).trim() ? String(row.rtoOtp).trim() : null,
    deliveryOtp:
      row.deliveryOtp != null && String(row.deliveryOtp).trim()
        ? String(row.deliveryOtp).trim()
        : null,
    customerFeedback:
      row.customerFeedback && typeof row.customerFeedback === "object"
        ? (row.customerFeedback as OrderCustomerFeedback)
        : null,
    storePrepDelaySeconds: toNumberOrNull(row.storePrepDelaySeconds),
    storePrepDelayLive: Boolean(row.storePrepDelayLive),
    storePrepDelayAnchorAt:
      row.storePrepDelayAnchorAt != null ? String(row.storePrepDelayAnchorAt) : null,
    storePrepDelayWasLate: Boolean(row.storePrepDelayWasLate),
    riderRestaurantWaitSeconds: toNumberOrNull(row.riderRestaurantWaitSeconds),
    riderRestaurantWaitLive: Boolean(row.riderRestaurantWaitLive),
    riderRestaurantWaitAnchorAt:
      row.riderRestaurantWaitAnchorAt != null
        ? String(row.riderRestaurantWaitAnchorAt)
        : null,
    deliveryProofImageUrl:
      row.deliveryProofImageUrl != null ? String(row.deliveryProofImageUrl) : null,
    rideDetail:
      row.rideDetail && typeof row.rideDetail === "object"
        ? (row.rideDetail as PersonRideOrderDetail)
        : null,
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
  onNotFoundChange?: (notFound: boolean) => void;
}

export default function OrderDetailClient({
  orderPublicId,
  onLoadingChange,
  onNotFoundChange,
}: OrderDetailClientProps) {
  const isHardReloadRef = useRef(false);
  const fetchGenerationRef = useRef(0);
  const orderRef = useRef<OrderDetail | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isHardReload, setIsHardReload] = useState(false);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  orderRef.current = order;
  const [merchantSummary, setMerchantSummary] = useState<MerchantSummaryFromApi | null>(null);
  const [initialRemarksCount, setInitialRemarksCount] = useState<number>(0);
  const [initialReconsCount, setInitialReconsCount] = useState<number>(0);
  const [initialNotificationsCount, setInitialNotificationsCount] = useState<number>(0);
  const [embeddedRemarks, setEmbeddedRemarks] = useState<SidebarRemark[] | null>(null);
  const [embeddedNotifications, setEmbeddedNotifications] = useState<SidebarCxNotification[] | null>(
    null
  );
  const [embeddedRecons, setEmbeddedRecons] = useState<SidebarRecon[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [dispatchSessionActive, setDispatchSessionActive] = useState(false);
  const [watchRiderAssignment, setWatchRiderAssignment] = useState(false);
  const [activityLogRefreshKey, setActivityLogRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<
    "picked_up" | "in_transit" | "delivered"
  >("picked_up");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [orderRefunds, setOrderRefunds] = useState<OrderRefundListItem[]>([]);
  const [orderRecoveryRecords, setOrderRecoveryRecords] = useState<
    OrderRecoveryRecordItem[]
  >([]);
  const [orderItemsPayload, setOrderItemsPayload] = useState<OrderItemsPayload | null>(null);
  const itemsPrefetchInFlight = useRef(false);
  const [orderTickets, setOrderTickets] = useState<OrderTicketSummary[]>([]);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [statusHistory, setStatusHistory] = useState<OrderStatusHistoryEntry[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<OrderTimelineEntry[] | null>(null);
  const [riderTimelineInitial, setRiderTimelineInitial] = useState<
    RiderTimelineData | null | undefined
  >(undefined);
  const [riderTrackingInitial, setRiderTrackingInitial] = useState<
    OrderRiderTrackingPayload | null | undefined
  >(undefined);
  const [paymentDetail, setPaymentDetail] = useState<OrderPaymentDetail | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState(false);
  const copyOrderIdResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedbackSheetTarget, setFeedbackSheetTarget] = useState<FeedbackSheetTarget | null>(
    null
  );
  const [partnerChatOpen, setPartnerChatOpen] = useState(false);

  const ensureOrderItemsPrefetch = useCallback(() => {
    const orderId = order?.id;
    if (orderId == null || !Number.isFinite(orderId)) return;
    if (orderItemsPayload?.items?.length) return;
    if (itemsPrefetchInFlight.current) return;

    itemsPrefetchInFlight.current = true;
    void fetchOrderItemsCached(orderId)
      .then((parsed) => {
        if (parsed) setOrderItemsPayload(parsed);
      })
      .finally(() => {
        itemsPrefetchInFlight.current = false;
      });
  }, [order?.id, orderItemsPayload?.items?.length]);

  const auth = useAuthOptional();
  const loggedInEmail = auth?.user?.email ?? null;
  const isOrderPage = useIsActiveRoute("/order");
  const pageVisible = usePageVisible();

  /** Payment detail loads after first paint so /api/orders/core stays fast. */
  useEffect(() => {
    const orderId = order?.id;
    if (orderId == null || !Number.isFinite(orderId)) return;
    if (!auth?.authReady) return;

    let cancelled = false;
    void fetch(`/api/orders/${orderId}/payment-detail`, { credentials: "include" })
      .then((r) => r.json().catch(() => null))
      .then((body: { success?: boolean; data?: OrderPaymentDetail } | null) => {
        if (cancelled) return;
        if (body?.success && body.data) setPaymentDetail(body.data);
      })
      .catch(() => {
        /* keep card fallbacks */
      });

    return () => {
      cancelled = true;
    };
  }, [order?.id, refetchTrigger, auth?.authReady]);

  /** Rider map tracking when not embedded in core response. */
  useEffect(() => {
    const orderId = order?.id;
    if (orderId == null || !Number.isFinite(orderId)) return;
    if (riderTrackingInitial !== undefined) return;

    let cancelled = false;
    void fetch(`/api/orders/${orderId}/rider-tracking`, { credentials: "include" })
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

  useEffect(() => {
    const hard = isHardPageReload();
    isHardReloadRef.current = hard;
    setIsHardReload(hard);
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    onLoadingChange?.(hasHydrated && isHardReload && loading && !order);
  }, [hasHydrated, isHardReload, loading, order, onLoadingChange]);

  useEffect(() => {
    const authPending = !auth?.authReady;
    onNotFoundChange?.(!loading && !authPending && Boolean(error || !order));
  }, [loading, error, order, onNotFoundChange, auth?.authReady]);

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
    if (!isOrderPage || !pageVisible) return;

    let cancelled = false;
    const generation = ++fetchGenerationRef.current;

    const normalizedPublicId = orderPublicId.trim().replace(/[-\s]/g, "");

    if (!normalizedPublicId) {
      setOrder(null);
      setPaymentDetail(null);
      setTimelineEntries(null);
      setRiderTimelineInitial(undefined);
      setOrderItemsPayload(null);
      setError("Invalid order ID.");
      setLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (!auth?.authReady) {
      return;
    }

    setOrderItemsPayload(null);

    const hasMatchingOrder =
      orderRef.current != null && orderMatchesPublicId(orderRef.current, normalizedPublicId);

    // Keep prior paymentDetail until the background fetch refreshes it (avoids empty modal).
    if (!hasMatchingOrder) {
      setPaymentDetail(null);
    }
    setRiderTrackingInitial(undefined);
    setRiderTimelineInitial(undefined);

    setOrder((prev) => {
      if (!prev) return null;
      return orderMatchesPublicId(prev, normalizedPublicId) ? prev : null;
    });

    if (refetchTrigger > 0) {
      setIsRefreshing(true);
    } else if (isHardReloadRef.current || !hasMatchingOrder) {
      setLoading(true);
      setIsRefreshing(false);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    const resolvedOrderType = resolveOrderTypeFromPublicId(normalizedPublicId);
    const params = new URLSearchParams({
      orderType: resolvedOrderType,
      searchType: "Order Id",
      search: normalizedPublicId,
      limit: "1",
    });
    if (refetchTrigger > 0) {
      params.set("skipCache", "1");
    }

    const loadTimelineInBackground = (coreOrderId: number) => {
      void fetch(`/api/orders/${coreOrderId}/timeline`)
        .then((r) => r.json().catch(() => null))
        .then((timelineBody) => {
          if (cancelled) return;
          if (timelineBody?.success && Array.isArray(timelineBody?.data)) {
            setTimelineEntries(
              mapTimelineEntries(timelineBody.data as OrderTimelineEntry[])
            );
          }
        });
    };

    const loadRiderTimelineInBackground = (coreOrderId: number, riderId: number) => {
      void fetch(`/api/orders/${coreOrderId}/rider-timeline?rider_id=${riderId}`)
        .then((r) => r.json().catch(() => null))
        .then((body: RiderTimelineData | null) => {
          if (cancelled) return;
          if (body && typeof body === "object") {
            setRiderTimelineInitial(body);
          }
        });
    };

    fetch(`/api/orders/core?${params.toString()}`)
      .then(async (res) => {
        const text = await res.text();
        if (!text.trim()) {
          return { success: false, error: res.ok ? "Empty response" : `HTTP ${res.status}` };
        }
        try {
          return JSON.parse(text) as {
            success?: boolean;
            data?: unknown[];
            error?: string;
            timeline?: OrderTimelineEntry[];
            riderTimeline?: RiderTimelineData | null;
            riderTracking?: OrderRiderTrackingPayload | null;
            merchantSummary?: unknown;
            remarksCount?: number;
            reconsCount?: number;
            notificationsCount?: number;
            remarks?: unknown[];
            recons?: unknown[];
            notifications?: unknown[];
            statusHistory?: unknown[];
            paymentDetail?: OrderPaymentDetail;
            riderActivityLog?: RiderActivityLogCacheEntry | null;
            riderDispatchUi?: unknown;
            partnerChat?: unknown;
          };
        } catch {
          throw new Error("Invalid order response");
        }
      })
      .then(async (body) => {
        if (cancelled) return;
        if (body.success && Array.isArray(body.data) && body.data.length > 0) {
          const row = body.data[0] as any;
          const coreOrderId =
            row.id != null && Number.isFinite(Number(row.id)) ? Number(row.id) : null;
          const itemsPromise =
            coreOrderId != null ? fetchOrderItemsCached(coreOrderId) : Promise.resolve(null);

          const embedded = body.timeline;
          const timeline = Array.isArray(embedded) ? embedded : [];
          const hasEmbeddedTimeline = body.timeline !== undefined;
          const embeddedRiderTimeline = body.riderTimeline;
          const hasEmbeddedRiderTimeline = body.riderTimeline !== undefined;
          const embeddedRiderTracking = body.riderTracking;
          const hasEmbeddedRiderTracking = body.riderTracking !== undefined;
          if (cancelled) return;

          setOrder(mapOrderCoreApiRowToDetail(row as Record<string, unknown>));
          if (fetchGenerationRef.current === generation) {
            setLoading(false);
            setIsRefreshing(false);
          }

          const toNumberOrNull = toNumberOrNullFromApi;

          if (body.merchantSummary != null && typeof body.merchantSummary === "object") {
            const raw = body.merchantSummary as MerchantSummaryFromApi;
            setMerchantSummary({
              ...raw,
              latitude: toNumberOrNull(raw.latitude),
              longitude: toNumberOrNull(raw.longitude),
            });
          } else {
            setMerchantSummary(null);
          }
          const userEmail = auth?.user?.email ?? null;
          setInitialRemarksCount(
            typeof body.remarksCount === "number" && body.remarksCount >= 0 ? body.remarksCount : 0
          );
          setInitialReconsCount(
            typeof body.reconsCount === "number" && body.reconsCount >= 0 ? body.reconsCount : 0
          );
          setInitialNotificationsCount(
            typeof body.notificationsCount === "number" && body.notificationsCount >= 0
              ? body.notificationsCount
              : 0
          );
          if (Array.isArray(body.remarks)) {
            setEmbeddedRemarks(
              mapRemarksFromApi(
                body.remarks as Parameters<typeof mapRemarksFromApi>[0],
                userEmail
              )
            );
          }
          if (Array.isArray(body.recons)) {
            setEmbeddedRecons(
              mapReconsFromApi(body.recons as Parameters<typeof mapReconsFromApi>[0])
            );
          }
          if (Array.isArray(body.notifications)) {
            setEmbeddedNotifications(
              mapNotificationsFromApi(
                body.notifications as Parameters<typeof mapNotificationsFromApi>[0]
              )
            );
          }
          if (Array.isArray(body.statusHistory)) {
            setStatusHistory(
              body.statusHistory
                .map(parseStatusHistoryEntry)
                .filter((h): h is OrderStatusHistoryEntry => h != null)
            );
          } else {
            setStatusHistory([]);
          }

          const paymentFromApi =
            (body as { paymentDetail?: OrderPaymentDetail }).paymentDetail ??
            (row.paymentDetail as OrderPaymentDetail | undefined);
          if (paymentFromApi != null) {
            setPaymentDetail(paymentFromApi);
          }

          setTimelineEntries(timeline.length > 0 ? mapTimelineEntries(timeline) : []);
          if (hasEmbeddedRiderTimeline) {
            setRiderTimelineInitial(
              embeddedRiderTimeline && typeof embeddedRiderTimeline === "object"
                ? embeddedRiderTimeline
                : null
            );
          } else if (coreOrderId != null && row.riderId != null && Number.isFinite(Number(row.riderId))) {
            loadRiderTimelineInBackground(coreOrderId, Number(row.riderId));
          } else {
            setRiderTimelineInitial(null);
          }
          if (hasEmbeddedRiderTracking) {
            setRiderTrackingInitial(
              embeddedRiderTracking && typeof embeddedRiderTracking === "object"
                ? embeddedRiderTracking
                : null
            );
          }
          // else: leave undefined / existing — background rider-tracking effect fills it
          if (coreOrderId != null && !hasEmbeddedTimeline) {
            loadTimelineInBackground(coreOrderId);
          }
          if (coreOrderId != null) {
            const embeddedRiderActivityLog = body.riderActivityLog;
            if (
              embeddedRiderActivityLog &&
              Array.isArray(embeddedRiderActivityLog.logs)
            ) {
              seedRiderActivityLogCache(coreOrderId, {
                logs: embeddedRiderActivityLog.logs,
                summary: embeddedRiderActivityLog.summary ?? {
                  total: embeddedRiderActivityLog.logs.length,
                  cancelled: 0,
                  delivered: 0,
                  distinctRiders: 0,
                },
                trackingOrderId: embeddedRiderActivityLog.trackingOrderId ?? null,
              });
            } else {
              prefetchRiderActivityLog(coreOrderId);
            }
            prefetchCancellationCatalogClient();
            const dispatchUi = body.riderDispatchUi as
              | {
                  dispatchSessionActive?: boolean;
                  dispatchManualHold?: boolean;
                }
              | undefined;
            if (dispatchUi) {
              setDispatchSessionActive(Boolean(dispatchUi.dispatchSessionActive));
              setWatchRiderAssignment(Boolean(dispatchUi.dispatchSessionActive));
            } else {
              setDispatchSessionActive(false);
              setWatchRiderAssignment(false);
            }
            const embeddedPartnerChat = body.partnerChat as
              | { messages?: unknown[]; chatClosed?: boolean }
              | undefined;
            if (
              embeddedPartnerChat &&
              Array.isArray(embeddedPartnerChat.messages)
            ) {
              seedPartnerChatCache(coreOrderId, {
                messages: embeddedPartnerChat.messages as PartnerChatCacheEntry["messages"],
                chatClosed: Boolean(embeddedPartnerChat.chatClosed),
              });
            } else {
              prefetchPartnerChat(coreOrderId);
            }
          }
          // Order detail is set immediately after API row parse (see mapOrderCoreApiRowToDetail).

          // Refunds + line items load in background so the page renders without extra round trips.
          void (async () => {
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
          })();

          void (async () => {
            try {
              const recoveryRes = await fetch(`/api/orders/${row.id}/recovery-records`);
              const recoveryBody = await recoveryRes.json().catch(() => null);
              if (
                !cancelled &&
                recoveryRes.ok &&
                recoveryBody?.success &&
                Array.isArray(recoveryBody.data)
              ) {
                setOrderRecoveryRecords(recoveryBody.data as OrderRecoveryRecordItem[]);
              } else if (!cancelled) {
                setOrderRecoveryRecords([]);
              }
            } catch {
              if (!cancelled) setOrderRecoveryRecords([]);
            }
          })();

          void itemsPromise.then((parsed) => {
            if (!cancelled && parsed) setOrderItemsPayload(parsed);
            else if (!cancelled) setOrderItemsPayload(null);
          });

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
          setOrderRecoveryRecords([]);
          setOrderTickets([]);
          if (fetchGenerationRef.current === generation) {
            setLoading(false);
            setIsRefreshing(false);
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        setError(msg ? `Failed to load order: ${msg}` : "Failed to load order.");
        if (fetchGenerationRef.current === generation) {
          setLoading(false);
          setIsRefreshing(false);
        }
      })
      .finally(() => {
        if (!cancelled && fetchGenerationRef.current === generation) {
          setLoading(false);
          setIsRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderPublicId, refetchTrigger, isOrderPage, pageVisible, auth?.authReady]);

  const dispatchStage = useMemo(
    () =>
      order
        ? resolveDispatchManualStage({
            status: order.status,
            currentStatus: order.currentStatus,
            foodOrderStatus: order.foodOrderStatus,
          })
        : "open",
    [order?.status, order?.currentStatus, order?.foodOrderStatus]
  );

  const orderCancelledOnTimeline = useMemo(() => {
    if (hasOrderCancellationOnProgressTimeline(timelineEntries)) return true;
    return dispatchStage === "cancelled";
  }, [timelineEntries, dispatchStage]);

  const openStatusModal = useCallback(() => {
    if (!order) return;
    if (dispatchStage === "cancelled" || dispatchStage === "delivered") return;
    setStatusUpdateError(null);
    const firstEnabled =
      STATUS_OPTIONS.find((opt) => !isManualStatusOptionDisabled(dispatchStage, opt.value))
        ?.value ?? "delivered";
    setSelectedStatus(firstEnabled);
    setShowStatusModal(true);
  }, [order, dispatchStage]);

  const submitStatusUpdate = useCallback(async () => {
    if (!order?.id || isUpdatingStatus) return;
    if (!canApplyManualStatusUpdate(dispatchStage, selectedStatus)) {
      setStatusUpdateError("This status is already set or cannot be applied again.");
      return;
    }
    setIsUpdatingStatus(true);
    setStatusUpdateError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const label = MANUAL_STATUS_LABELS[selectedStatus];
        setShowStatusModal(false);
        setOrder((prev) =>
          prev ? { ...prev, status: selectedStatus, currentStatus: label } : prev
        );
        setTimelineEntries((prev) => {
          const newEntry: OrderTimelineEntry = {
            id: -Date.now(),
            orderId: order.id,
            status: label,
            previousStatus: order.currentStatus ?? order.status ?? null,
            actorType: "agent",
            actorId: null,
            actorName: loggedInEmail,
            statusMessage: null,
            occurredAt: new Date().toISOString(),
          };
          return [...(prev ?? []), newEntry];
        });
        setRefetchTrigger((t) => t + 1);
      } else {
        setStatusUpdateError(
          typeof data.error === "string"
            ? data.error
            : "Could not update order status. Please try again."
        );
      }
    } catch {
      setStatusUpdateError("Could not update order status. Please try again.");
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    order?.id,
    order?.status,
    order?.currentStatus,
    selectedStatus,
    isUpdatingStatus,
    dispatchStage,
    loggedInEmail,
  ]);

  const handleRefreshOrder = useCallback(() => {
    setRefetchTrigger((t) => t + 1);
  }, []);

  const refreshRiderAssignmentArtifacts = useCallback(
    (coreOrderId: number, riderId: number, previousRiderId: number | null) => {
      if (riderId === previousRiderId) return;
      invalidateRiderActivityLogCache(coreOrderId);
      void fetchRiderActivityLogCached(coreOrderId);
      setActivityLogRefreshKey((k) => k + 1);
      void fetch(`/api/orders/${coreOrderId}/rider-timeline?rider_id=${riderId}`, {
        credentials: "include",
      })
        .then((r) => r.json().catch(() => null))
        .then((body) => {
          if (body && typeof body === "object") {
            setRiderTimelineInitial(body as RiderTimelineData);
          }
        });
      void fetch(`/api/orders/${coreOrderId}/rider-tracking`, { credentials: "include" })
        .then((r) => r.json().catch(() => null))
        .then((body) => {
          if (body && typeof body === "object") {
            setRiderTrackingInitial(body as OrderRiderTrackingPayload);
          }
        });
    },
    []
  );

  useEffect(() => {
    const coreId = order?.id;
    if (!isOrderPage || !pageVisible || coreId == null || !order) return;

    const statusUpper = String(order.currentStatus ?? order.status ?? "").toUpperCase();
    const isTerminal =
      statusUpper === "DELIVERED" || ["CANCELLED", "FAILED", "REJECTED"].includes(statusUpper);
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
          dispatchManualHold?: boolean;
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
            refreshRiderAssignmentArtifacts(coreId, nextRiderId, previousRiderId);
            setWatchRiderAssignment(false);
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
    isOrderPage,
    pageVisible,
    watchRiderAssignment,
    dispatchSessionActive,
    refreshRiderAssignmentArtifacts,
  ]);

  const displayId = useMemo(
    () =>
      order
        ? order.formattedOrderId ?? order.orderId ?? `GMF${order.id.toString().padStart(6, "0")}`
        : "—",
    [order]
  );

  useEffect(() => {
    setCopiedOrderId(false);
    if (copyOrderIdResetRef.current) {
      clearTimeout(copyOrderIdResetRef.current);
      copyOrderIdResetRef.current = null;
    }
    return () => {
      if (copyOrderIdResetRef.current) {
        clearTimeout(copyOrderIdResetRef.current);
        copyOrderIdResetRef.current = null;
      }
    };
  }, [order?.id, displayId]);

  const assignedRiderId =
    order?.riderId != null &&
    Number.isFinite(Number(order.riderId)) &&
    Number(order.riderId) > 0
      ? Number(order.riderId)
      : null;
  const trackingRiderId = riderTrackingInitial?.rider?.id ?? null;
  const riderSelfieUrl =
    assignedRiderId != null &&
    trackingRiderId != null &&
    trackingRiderId === assignedRiderId
      ? (riderTrackingInitial?.rider?.selfie_url ?? null)
      : null;

  useEffect(() => {
    const url = riderSelfieUrl?.trim();
    if (!url) return;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }, [riderSelfieUrl]);

  const authPending = !auth?.authReady;
  const awaitingOrder = !order && (loading || authPending);

  if (awaitingOrder) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 top-11 z-10 flex items-center justify-center bg-[#F8FAFC] sm:top-12"
        aria-busy="true"
        aria-label="Loading order details"
      >
        <InfinitySpinner />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div
        className="flex min-h-screen w-full items-center justify-center bg-[#F8FAFC] px-4"
        role="alert"
      >
        <p className="text-center text-sm font-medium text-red-600">
          {error ?? "Order not found."}
        </p>
      </div>
    );
  }

  const statusLabel = order.currentStatus ?? order.status;
  const orderTimeLabel = order.orderTimeIso
    ? new Date(order.orderTimeIso).toLocaleString("en-IN", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })
    : order.createdAt
      ? new Date(order.createdAt).toLocaleString("en-IN", {
          day: "numeric",
          month: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      : "—";
  const createdLabel = orderTimeLabel;
  const updatedLabel = order.updatedAt
    ? new Date(order.updatedAt).toLocaleString()
    : "—";

  const rawId = displayId === "—" ? "" : String(displayId);
  const normalizedId = rawId.replace(/^#/, "");
  const idPrefix = normalizedId.length > 4 ? normalizedId.slice(0, -4) : normalizedId;
  const idLast4 = normalizedId.length > 4 ? normalizedId.slice(-4) : "";
  const idLast4Chars = idLast4.split("");

  const orderStatusLabel = formatRiderOrderStatusDisplayLabel(statusLabel, order.orderType);

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
  const statusOptionMatch = STATUS_OPTIONS.find(
    (opt) => opt.value === (order.status ?? "").toString().toLowerCase()
  );
  const statusButtonLabel = statusOptionMatch
    ? order.orderType === "person_ride" && statusOptionMatch.value === "delivered"
      ? "Completed"
      : statusOptionMatch.label
    : "Select Option";
  const isOrderCancelledOrRejected = dispatchStage === "cancelled";

  const isOptionDisabled = (value: ManualStatusValue) =>
    isManualStatusOptionDisabled(dispatchStage, value);

  const isUpdateStatusButtonDisabled =
    dispatchStage === "delivered" ||
    dispatchStage === "cancelled" ||
    !canApplyManualStatusUpdate(dispatchStage, selectedStatus);

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

  const hasAssignedRider =
    order.riderId != null && Number.isFinite(Number(order.riderId)) && Number(order.riderId) > 0;

  const actionBannerMessage = resolveOrderActionBannerMessage({
    status: order.status,
    currentStatus: order.currentStatus,
    foodOrderStatus: order.foodOrderStatus,
    hasRider: hasAssignedRider,
  });

  const mapDrop = resolveMapCoordinatePair(
    order.dropLat,
    order.dropLon,
    parseGeocodedLatLon(order.dropAddressGeocoded)
  );
  const mapDropLat = mapDrop?.lat ?? null;
  const mapDropLon = mapDrop?.lon ?? null;

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
    if (copyOrderIdResetRef.current) {
      clearTimeout(copyOrderIdResetRef.current);
      copyOrderIdResetRef.current = null;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(normalizedId)
        .then(() => {
          setCopiedOrderId(true);
          copyOrderIdResetRef.current = setTimeout(() => {
            setCopiedOrderId(false);
            copyOrderIdResetRef.current = null;
          }, 2500);
        })
        .catch(() => {
          // Swallow clipboard errors; copying is a convenience feature.
        });
    }
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-y-contain lg:flex-row lg:gap-4 lg:overflow-hidden text-[12px] md:text-[13px] text-slate-700">
      <div className="w-full min-w-0 space-y-3 bg-[#F8FAFC] lg:min-h-0 lg:flex-[4] lg:overflow-y-auto lg:overscroll-y-contain lg:pr-3">
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
                className={`inline-flex shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-slate-500 transition hover:bg-transparent hover:text-slate-700 cursor-pointer ${
                  copiedOrderId ? "min-h-5 px-0.5" : "h-5 w-5"
                }`}
                aria-label={copiedOrderId ? "Copied" : "Copy order ID"}
              >
                {copiedOrderId ? (
                  <span
                    className="text-[10px] font-medium text-emerald-600 whitespace-nowrap"
                    role="status"
                    aria-live="polite"
                  >
                    Copied
                  </span>
                ) : (
                  <span className="text-[10px]" aria-hidden>
                    ⧉
                  </span>
                )}
              </button>
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-600">
              <span className="text-slate-800">{createdLabel}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-[11px]">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {effectiveRoutedTo && (
                <p className="text-[11px] text-slate-500">
                  Routed To:{" "}
                  <span className="font-medium text-slate-800">
                    {effectiveRoutedTo}
                  </span>
                </p>
              )}
              <button
                type="button"
                onClick={handleRefreshOrder}
                disabled={isRefreshing}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-slate-500 transition hover:bg-transparent hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                title="Refresh order details"
                aria-label="Refresh order details"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                  aria-hidden
                />
              </button>
            </div>
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
                  {statusUpdateError ? (
                    <p className="mt-1 px-2 text-[10px] text-red-600" role="alert">
                      {statusUpdateError}
                    </p>
                  ) : null}
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

        {/* Order progress timeline + ops action banner (separate rows) */}
        <div className="mt-2 mb-4 space-y-2">
          <OrderTimeline
            orderId={order.id}
            initialEntries={timelineEntries}
            currentStatus={statusLabel || undefined}
            orderCreatedAt={order.createdAt ? new Date(order.createdAt) : undefined}
            etaAt={(() => {
              if (order.firstEtaAt) return new Date(order.firstEtaAt);
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
          />
          {actionBannerMessage ? (
            <OrderActionBanner message={actionBannerMessage} />
          ) : null}
        </div>

        {/* Main info sections */}
        <div className="mt-3 space-y-3">
          {order.orderType === "person_ride" ? (
            <PersonRideOrderSections
              order={order as unknown as Parameters<typeof PersonRideOrderSections>[0]["order"]}
              rideDetail={order.rideDetail ?? null}
              displayId={displayId}
              createdLabel={createdLabel}
              paymentDetail={paymentDetail}
              orderRefunds={orderRefunds}
              recoveryRecords={orderRecoveryRecords}
              onCopy={handleCopy}
              onPhoneClick={handleCustomerPhoneClick}
              onRefresh={handleRefreshOrder}
            />
          ) : (
          <>
          {/* Main grid of sections — food / parcel */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {/* Customer card */}
            <CustomerDetails
              order={{
                userId: order.customerExternalId ?? order.customerId ?? order.id,
                customerDbId: order.customerId,
                customerLatLon:
                  order.dropLat != null && order.dropLon != null
                    ? `${order.dropLat}, ${order.dropLon}`
                    : null,
                customerName: order.customerName,
                customerMobile: order.customerMobile,
                customerAlternateMobile: order.customerAlternateMobile,
                orderAlternateContactPhone: order.orderAlternateContactPhone,
                orderDeliveryPrimaryContactPhone: order.orderDeliveryPrimaryContactPhone,
                customerEmail: order.customerEmail,
                customerAddress: order.dropAddressNormalized ?? order.dropAddressRaw,
                dropAddressRaw: order.dropAddressRaw,
                dropAddressNormalized: order.dropAddressNormalized,
                dropAddressGeocoded: order.dropAddressGeocoded,
                userType: order.customerUserType ?? order.customerTrustTierLabel ?? null,
                fraudReasons: order.customerFraudReasons ?? [],
                locationMismatch: isLocationMismatch,
                accountStatus: order.customerAccountStatus,
                riskFlag: order.customerRiskFlag,
              }}
              onCopy={handleCopy}
              onPhoneClick={handleCustomerPhoneClick}
              onOpenPartnerChat={() => setPartnerChatOpen(true)}
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
              customerFeedback={order.customerFeedback ?? null}
              onOpenFeedback={() => setFeedbackSheetTarget("merchant")}
              onCopy={handleCopy}
            />

            {/* Payment details */}
            <PaymentDetails
              order={order}
              displayId={displayId}
              orderRefunds={orderRefunds}
              recoveryRecords={orderRecoveryRecords}
              paymentDetail={paymentDetail}
              orderItemsPricing={orderItemsPayload?.pricing ?? null}
              onPrefetchOrderItems={ensureOrderItemsPrefetch}
            />
          </div>
          </>
          )}

          {/* Rider + map — all order types */}
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-stretch">
            <div className="w-full md:w-1/2 md:min-w-0 md:shrink-0">
            <RiderDetails
              className="h-full flex flex-col"
              initialRiderTimeline={riderTimelineInitial}
              riderSelfieUrl={riderSelfieUrl}
              dispatchSessionActive={dispatchSessionActive}
              activityLogRefreshKey={activityLogRefreshKey}
              order={{
                orderId: order.id,
                riderId: order.riderId ?? null,
                riderName: order.riderName,
                riderMobile: order.riderMobile,
                riderProvider: hasAssignedRider
                  ? formatDeliveredByLabel(order.deliveredBy, order.riderId)
                  : null,
                trackingOrderId: hasAssignedRider ? displayId : null,
                trackingUrl: null,
                deliveryOtp: order.deliveryOtp ?? null,
                deliveryType: order.deliveryType ?? null,
                status: order.status,
                currentStatus: order.currentStatus,
                createdAt: order.createdAt,
                distanceKm: order.distanceKm ?? null,
                riderRestaurantWaitSeconds: order.riderRestaurantWaitSeconds ?? null,
                riderRestaurantWaitLive: order.riderRestaurantWaitLive ?? false,
                riderRestaurantWaitAnchorAt: order.riderRestaurantWaitAnchorAt ?? null,
                orderType: order.orderType,
              }}
              deliveryProofImageUrl={order.deliveryProofImageUrl ?? null}
              customerFeedback={order.customerFeedback ?? null}
              tipAmount={order.tipAmount}
              onOpenFeedback={() => setFeedbackSheetTarget("rider")}
              onCopy={handleCopy}
              onPhoneClick={handleCustomerPhoneClick}
              onRiderManagementComplete={(detail) => {
                if (order.id != null) {
                  invalidateRiderActivityLogCache(order.id);
                  void fetchRiderActivityLogCached(order.id);
                  setActivityLogRefreshKey((k) => k + 1);
                }
                if (
                  detail.action === "cancel_reassign" ||
                  detail.action === "assign_rider"
                ) {
                  setDispatchSessionActive(true);
                  setWatchRiderAssignment(true);
                } else {
                  setDispatchSessionActive(false);
                  setWatchRiderAssignment(false);
                }
                handleRefreshOrder();
              }}
            />
            </div>
            {hasAssignedRider ? (
              <div className="w-full md:w-1/2 md:min-w-0">
              <RiderRouteMap
                key={`rider-map-${order.riderId}`}
                className="h-full flex flex-col"
                orderId={order.id}
                riderId={order.riderId ?? null}
                riderName={order.riderName}
                storeName={
                  order.orderType === "person_ride"
                    ? "Pickup"
                    : merchantSummary?.storeName ?? null
                }
                customerName={order.customerName}
                dropAddressFallback={
                  order.dropAddressNormalized ?? order.dropAddressRaw ?? null
                }
                merchantStoreLat={
                  order.orderType === "person_ride"
                    ? order.pickupLat ?? null
                    : merchantSummary?.latitude ?? null
                }
                merchantStoreLon={
                  order.orderType === "person_ride"
                    ? order.pickupLon ?? null
                    : merchantSummary?.longitude ?? null
                }
                pickupAddressGeocoded={order.pickupAddressGeocoded ?? null}
                orderStatus={order.currentStatus ?? order.status}
                coreStatus={order.status}
                foodOrderStatus={order.foodOrderStatus}
                dispatchedAt={order.dispatchedAt}
                riderPickedUpAt={order.riderPickedUpAt}
                pickedUpAt={
                  riderTimelineInitial?.picked_up_at ??
                  order.riderPickedUpAt ??
                  null
                }
                reachedMerchantAt={riderTimelineInitial?.reached_merchant_at ?? null}
                pickupLat={order.pickupLat ?? null}
                pickupLon={order.pickupLon ?? null}
                dropLat={mapDropLat}
                dropLon={mapDropLon}
                initialTracking={riderTrackingInitial ?? null}
              />
              </div>
            ) : null}
          </div>
        </div>
      </div>

        {/* Right sidebar */}
      <div className="w-full min-w-0 bg-[#F8FAFC] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain lg:pl-2 lg:max-w-[320px] xl:max-w-[360px]">
        <OrderRightSidebar
          order={order}
          orderRefunds={orderRefunds}
          prefetchedOrderItems={orderItemsPayload}
          itemCount={
            orderItemsPayload?.items?.length
              ? computeOrderItemQuantityCount({
                  items: orderItemsPayload.items.filter((i) => i.id > 0),
                  food_items_count: order.itemCount,
                })
              : order.itemCount ?? undefined
          }
          initialRemarksCount={initialRemarksCount}
          initialReconsCount={initialReconsCount}
          initialNotificationsCount={initialNotificationsCount}
          initialRemarks={embeddedRemarks ?? undefined}
          initialNotifications={embeddedNotifications ?? undefined}
          initialRecons={embeddedRecons ?? undefined}
          activityRefreshKey={refetchTrigger}
          onRoutedToChange={(email) =>
            setOrder((prev) => (prev ? { ...prev, routedToEmail: email } : prev))
          }
          onRefundCreated={() => setRefetchTrigger((t) => t + 1)}
          onPrefetchOrderItems={ensureOrderItemsPrefetch}
          orderCancelledOnTimeline={orderCancelledOnTimeline}
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
                      <th className="py-2 pr-3 font-semibold text-slate-700">Status</th>
                      <th className="py-2 pr-3 font-semibold text-slate-700">Date & time</th>
                      <th className="py-2 pr-3 font-semibold text-slate-700">Role</th>
                      <th className="py-2 font-semibold text-slate-700">Updated by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusHistory.map((entry, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 pr-4 font-medium text-slate-800">
                          {entry.toStatus === "delivered"
                            ? formatRiderOrderStatusDisplayLabel("delivered", order.orderType)
                            : MANUAL_STATUS_LABELS[entry.toStatus as ManualStatusValue] ??
                              entry.toStatus.replace(/_/g, " ")}
                        </td>
                        <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3">
                          <AgentRoleBadge role={entry.updatedByRole} />
                        </td>
                        <td className="py-2 text-slate-600 truncate max-w-[180px]" title={entry.updatedByEmail}>
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
                  <Link
                    key={t.id}
                    href={`/dashboard/tickets/${t.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    prefetch={false}
                    className="w-full text-left px-3 py-2 rounded-md border border-slate-100 hover:bg-slate-50 flex flex-col gap-0.5 cursor-pointer no-underline"
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
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {feedbackSheetTarget != null && order?.customerFeedback ? (
        <OrderCustomerFeedbackSideSheet
          target={feedbackSheetTarget}
          feedback={order.customerFeedback}
          tipAmount={order.tipAmount}
          merchantName={merchantSummary?.storeName}
          riderName={order.riderName}
          onClose={() => setFeedbackSheetTarget(null)}
        />
      ) : null}

      {partnerChatOpen && order ? (
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
    </>
  );
}

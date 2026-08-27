"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { STANDARD_REMARKS } from "@/lib/remarks/standardRemarks";
import { useAuthOptional } from "@/providers/AuthProvider";
import { syncServerSessionCookies } from "@/lib/auth/sync-server-session";
import { isNetworkOrTransientError } from "@/lib/auth/session-errors";
import { Bell, ClipboardCheck, MessageCircle, Pencil, UserCircle2, X } from "lucide-react";
import ItemsRefundModal from "./ItemsRefundModal";
import { classifyRefund, orderRefundState } from "@/lib/orders/refund-status";
import type { OrderItemsPayload } from "@/lib/orderItemsPayload";
import { computeOrderItemQuantityCount } from "@/lib/merchantOrderFoodActions";
import {
  formatDurationSecondsLabel,
  formatFirstEtaAt,
  formatKptMinutes,
  formatMerchantExtraPrepMinutes,
  formatOrderDeliveryTypeLabel,
  formatOrderInitiatedByLabel,
  formatScheduledOrderLabel,
  shouldShowMerchantUpdatedKpt,
} from "@/lib/orders/order-detail-display";
import { useLiveElapsedSeconds } from "@/hooks/useLiveElapsedSeconds";
import { OrderEtaHistorySideSheet } from "./OrderEtaHistorySideSheet";
import {
  RejectionInfoEntryCard,
  RejectionInfoSideSheet,
} from "./RejectionInfoSideSheet";
import { formatRtoOtpDisplay } from "@/lib/orderOtps";
import {
  dashboardRejectionCancellationDisplay,
  formatRejectionAmount,
  hasOrderCancellationInfo,
  isFaultDebitMetadataLine,
  pickPreferredRefundStatus,
  rejectionAmountsMatch,
  rejectionTimesMatch,
  type OrderCancellationInfo,
} from "@/lib/merchant-cancellation-display";
import {
  mapNotificationsFromApi,
  mapReconsFromApi,
  mapRemarksFromApi,
  type SidebarCxNotification,
  type SidebarRecon,
  type SidebarRemark,
} from "@/lib/orders/order-sidebar-activity";
import {
  fetchRiderActivityLogCached,
} from "@/lib/riderActivityLogCache";
import { OrderMixedText, OrderNum } from "@/components/orders/orders-typography";
import { OrderPageOverlay } from "@/components/orders/OrderPageOverlay";
import { formatOrderDistanceKmLabel } from "@/lib/orders/order-distance-display";

interface OrderRightSidebarProps {
  order: {
    id: number;
    formattedOrderId: string | null;
    orderId: string | null;
    orderSource?: string | null;
    status: string;
    currentStatus: string | null;
    paymentStatus: string | null;
    createdAt: string;
    updatedAt: string;
    customerName: string | null;
    customerMobile: string | null;
    dropAddressRaw: string | null;
    merchantStoreId: number | null;
    merchantParentId: number | null;
    riderId?: number | null;
    riderName?: string | null;
    riderMobile?: string | null;
    distanceKm?: number | null;
    routedToEmail?: string | null;
    /** Legacy single-line delivery instructions (orders_food). */
    deliveryInstructions?: string | null;
    riderInstructionsList?: string[];
    merchantInstructionsList?: string[];
    /** First ETA (expected delivery) frozen at order placement. */
    firstEtaAt?: string | null;
    estimatedDeliveryTime?: string | null;
    etaSeconds?: number | null;
    itemCount?: number | null;
    systemKptMinutes?: number | null;
    merchantUpdatedKptMinutes?: number | null;
    merchantExtraPrepMinutes?: number | null;
    isScheduledOrder?: boolean;
    scheduledDeliverySummary?: string | null;
    deliveryType?: string | null;
    contactlessDelivery?: boolean | null;
    acceptanceSource?: string | null;
    localityIsSafe?: boolean | null;
    deliveryInitiator?: string | null;
    pickupOtp?: string | null;
    rtoOtp?: string | null;
    cancellationInfo?: OrderCancellationInfo | null;
    storePrepDelaySeconds?: number | null;
    storePrepDelayLive?: boolean;
    storePrepDelayAnchorAt?: string | null;
    storePrepDelayWasLate?: boolean;
  };
  /** Line-item count (prefetched items or API enrichment). */
  itemCount?: number;
  /** Counts from order API so "See all (N)" shows instantly without waiting for list fetch. */
  initialRemarksCount?: number;
  initialReconsCount?: number;
  initialNotificationsCount?: number;
  /** Prefetched lists from /api/orders/core or parent refresh — shown immediately on page load. */
  initialRemarks?: SidebarRemark[];
  initialNotifications?: SidebarCxNotification[];
  initialRecons?: SidebarRecon[];
  /** Bumps when parent refetches order so embedded activity re-seeds. */
  activityRefreshKey?: number;
  /** Notify parent when latest remark agent email changes so "Routed To" updates instantly. */
  onRoutedToChange?: (email: string | null) => void;
  /** Refunds for this order (from GET /api/orders/[id]/refunds). Shown in Rejection Info. */
  orderRefunds?: Array<{
    id: number;
    refundReason: string;
    refundDescription: string | null;
    refundAmount: string;
    refundStatus: string | null;
    executionStatus?: string | null;
    failureReason?: string | null;
    initiatedByEmail: string | null;
    createdAt: string;
  }>;
  /** Called after a refund is successfully created so parent can refetch refunds. */
  onRefundCreated?: () => void;
  /** Preloaded from GET /api/orders/[id]/items so Items modal opens instantly. */
  prefetchedOrderItems?: OrderItemsPayload | null;
  /** Warm items cache before opening the modal (hover / click). */
  onPrefetchOrderItems?: () => void;
  /** Order progress timeline already has a cancellation — block refund+cancel type. */
  orderCancelledOnTimeline?: boolean;
  /** Sum of non-failed refunds already covers the order grand total. */
  orderFullyRefunded?: boolean;
  /** Order is both cancelled AND fully refunded — no cancel/refund action is possible. */
  refundActionsDisabled?: boolean;
  /** Remaining amount that can still be refunded (grand total − already refunded). */
  refundRemainingRefundable?: number;
}

type Remark = SidebarRemark;

interface RemarkEditHistoryEntry {
  id: number;
  editedAt: string;
  editedTimeLabel: string;
  editedByActorType: string;
  editedByActorName: string | null;
  oldRemark: string;
  newRemark: string;
  oldRemarkCategory: string | null;
  newRemarkCategory: string | null;
}

/** One option in the "Select rider" dropdown (current order rider + any from recons) */
interface AssignedRiderOption {
  id: string;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  providerName: string | null;
}

type Recon = SidebarRecon;

const RECON_REASON_SEP = " !!!!!! ";

/** Show GatiMitra instead of internal for provider name */
function normalizeProviderName(name: string | null | undefined): string | null {
  if (!name || !String(name).trim()) return null;
  const t = String(name).trim().toLowerCase();
  if (t === "internal") return "GatiMitra";
  return String(name).trim();
}

/** e.g. SHIPROCKET_DIRECT( rahul prajapati [ 9540799989 ] ) */
function buildReconRiderLabel(params: {
  providerName?: string | null;
  riderName?: string | null;
  riderMobile?: string | null;
}): string {
  const provider =
    normalizeProviderName(params.providerName) ?? params.providerName?.trim() ?? "";
  const name = params.riderName?.trim() ?? "";
  const mobile = params.riderMobile?.trim() ?? "";
  if (!provider && !name && !mobile) return "Unknown rider";
  if (!provider) {
    if (name && mobile) return `${name} [ ${mobile} ]`;
    return name || mobile || "Unknown rider";
  }
  if (!name && !mobile) return provider;
  if (name && mobile) return `${provider}( ${name} [ ${mobile} ] )`;
  if (name) return `${provider}( ${name} )`;
  return `${provider}( [ ${mobile} ] )`;
}

function riderOptionDedupeKey(r: AssignedRiderOption): string {
  if (r.riderId != null) return `rider_${r.riderId}`;
  const mobile = (r.riderMobile ?? "").replace(/\D/g, "");
  const name = (r.riderName ?? "").trim().toLowerCase();
  if (mobile.length >= 8) return `mobile_${mobile}`;
  if (name) return `name_${name}`;
  return `id_${r.id}`;
}

function pickBetterRiderOption(
  existing: AssignedRiderOption,
  incoming: AssignedRiderOption
): AssignedRiderOption {
  const riderId = existing.riderId ?? incoming.riderId;
  const riderName =
    existing.riderName?.trim() || incoming.riderName?.trim() || null;
  const riderMobile =
    existing.riderMobile?.trim() || incoming.riderMobile?.trim() || null;
  const providerName =
    existing.providerName?.trim() || incoming.providerName?.trim() || null;
  const preferId = !existing.id.startsWith("assign_")
    ? existing.id
    : !incoming.id.startsWith("assign_")
      ? incoming.id
      : existing.id;
  return {
    id: preferId,
    riderId: riderId ?? null,
    riderName,
    riderMobile,
    providerName,
  };
}

function mergeAssignedRiderOptions(lists: AssignedRiderOption[][]): AssignedRiderOption[] {
  const byKey = new Map<string, AssignedRiderOption>();
  for (const list of lists) {
    for (const r of list) {
      const key = riderOptionDedupeKey(r);
      const prev = byKey.get(key);
      byKey.set(key, prev ? pickBetterRiderOption(prev, r) : r);
    }
  }
  return Array.from(byKey.values());
}

function assignedRidersFromOrder(order: OrderRightSidebarProps["order"]): AssignedRiderOption[] {
  if (order.riderId == null && !order.riderName?.trim() && !order.riderMobile?.trim()) {
    return [];
  }
  return [
    {
      id: order.riderId != null ? String(order.riderId) : "current",
      riderId: order.riderId ?? null,
      riderName: order.riderName ?? null,
      riderMobile: order.riderMobile ?? null,
      providerName: normalizeProviderName(order.orderSource) ?? order.orderSource ?? null,
    },
  ];
}

function assignedRidersFromAssignments(
  items: Array<{
    id: number;
    riderId: number | null;
    riderName: string | null;
    riderMobile: string | null;
    deliveryProvider: string | null;
  }>
): AssignedRiderOption[] {
  return items.map((a) => ({
    id: `assign_${a.id}`,
    riderId: a.riderId,
    riderName: a.riderName,
    riderMobile: a.riderMobile,
    providerName: normalizeProviderName(a.deliveryProvider) ?? a.deliveryProvider,
  }));
}

function assignedRidersFromReconRecords(
  items: Array<{
    id: number;
    riderId?: number | null;
    providerName: string | null;
    riderName: string | null;
    riderMobile: string | null;
  }>
): AssignedRiderOption[] {
  const out: AssignedRiderOption[] = [];
  const seen = new Set<string>();
  for (const r of items) {
    const option: AssignedRiderOption = {
      id: r.riderId != null ? String(r.riderId) : `recon_${r.id}`,
      riderId: r.riderId ?? null,
      riderName: r.riderName ?? null,
      riderMobile: r.riderMobile ?? null,
      providerName: normalizeProviderName(r.providerName) ?? r.providerName ?? null,
    };
    const key = riderOptionDedupeKey(option);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

function assignedRidersFromSidebarRecons(items: SidebarRecon[]): AssignedRiderOption[] {
  return assignedRidersFromReconRecords(
    items.map((r) => ({
      id: Number(r.id) || 0,
      riderId: null,
      providerName: r.providerName ?? null,
      riderName: r.riderName ?? null,
      riderMobile: r.riderMobile ?? null,
    }))
  );
}

function assignedRidersFromActivityLog(
  logs: Array<{
    riderId: number | null;
    riderName: string | null;
    riderMobile: string | null;
    provider: string;
  }>
): AssignedRiderOption[] {
  const out: AssignedRiderOption[] = [];
  const seen = new Set<string>();
  for (const log of logs) {
    if (log.riderId == null && !log.riderName?.trim() && !log.riderMobile?.trim()) {
      continue;
    }
    const option: AssignedRiderOption = {
      id: log.riderId != null ? String(log.riderId) : `log_${seen.size}`,
      riderId: log.riderId,
      riderName: log.riderName ?? null,
      riderMobile: log.riderMobile ?? null,
      providerName: normalizeProviderName(log.provider) ?? log.provider ?? null,
    };
    const key = riderOptionDedupeKey(option);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

type RejectionInfoEntry = {
  id: string;
  kind: "refund" | "cancellation" | "merged";
  reason: string;
  detail: string | null;
  source: string | null;
  by: string | null;
  at: string;
  atIso?: string | null;
  rider: string | null;
  amount: string | null;
  status: string | null;
};

function formatRejectionAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function pickRejectionActor(...actors: Array<string | null | undefined>): string | null {
  const list = actors.map((a) => a?.trim()).filter(Boolean) as string[];
  if (list.length === 0) return null;
  const generic = (s: string) =>
    /^super[_\s-]?admin$/i.test(s) || s.toUpperCase() === "SUPER_ADMIN";
  const email = list.find((a) => a.includes("@"));
  if (email) return email;
  const nonGeneric = list.find((a) => !generic(a));
  return nonGeneric ?? list[0];
}

function pickPrimaryRejectionReason(...candidates: Array<string | null | undefined>): string {
  const list = candidates.map((c) => c?.trim()).filter(Boolean) as string[];
  if (list.length === 0) return "Order cancelled";
  const catalogStyle = list.find((t) => !isFaultDebitMetadataLine(t) && t.includes(" - "));
  if (catalogStyle) return catalogStyle;
  const nonMeta = list.find((t) => !isFaultDebitMetadataLine(t));
  return nonMeta ?? list[0];
}

function pickRejectionDetail(
  reason: string,
  ...details: Array<string | null | undefined>
): string | null {
  const reasonNorm = reason.trim().toLowerCase();
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const d of details) {
    const t = d?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (key === reasonNorm) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(t);
  }
  return lines.length ? lines.join("\n") : null;
}

function shouldMergeRejectionPair(
  cancellation: RejectionInfoEntry & { atIso: string | null },
  refund: RejectionInfoEntry & { atIso: string | null },
  refundCount: number
): boolean {
  if (refundCount === 1) return true;
  return (
    rejectionAmountsMatch(cancellation.amount, refund.amount) &&
    rejectionTimesMatch(cancellation.atIso, refund.atIso)
  );
}

function mergeRejectionPair(
  cancellation: RejectionInfoEntry & { atIso: string | null },
  refund: RejectionInfoEntry & { atIso: string | null }
): RejectionInfoEntry {
  const reason = pickPrimaryRejectionReason(refund.reason, cancellation.reason, cancellation.detail);
  const atIsoPrefer =
    [cancellation.atIso, refund.atIso]
      .filter(Boolean)
      .sort((a, b) => Date.parse(String(b)) - Date.parse(String(a)))[0] ?? null;
  return {
    id: `merged-${refund.id}`,
    kind: "merged",
    reason,
    detail: pickRejectionDetail(
      reason,
      isFaultDebitMetadataLine(cancellation.reason) ? cancellation.reason : null,
      cancellation.detail,
      refund.detail,
      isFaultDebitMetadataLine(refund.reason) ? refund.reason : null
    ),
    source: cancellation.source ?? refund.source,
    by: pickRejectionActor(refund.by, cancellation.by),
    at: cancellation.at !== "—" ? cancellation.at : refund.at,
    atIso: atIsoPrefer,
    rider: cancellation.rider ?? refund.rider,
    amount: cancellation.amount ?? refund.amount,
    status: pickPreferredRefundStatus(cancellation.status, refund.status),
  };
}

function dedupeRejectionEntries(
  cancellation: (RejectionInfoEntry & { atIso: string | null }) | null,
  refunds: Array<RejectionInfoEntry & { atIso: string | null }>
): RejectionInfoEntry[] {
  const out: RejectionInfoEntry[] = [];
  let cancelLeft = cancellation;
  const mergedRefundIds = new Set<string>();

  if (cancelLeft) {
    for (const refund of refunds) {
      if (
        !mergedRefundIds.has(refund.id) &&
        shouldMergeRejectionPair(cancelLeft, refund, refunds.length)
      ) {
        out.push(mergeRejectionPair(cancelLeft, refund));
        mergedRefundIds.add(refund.id);
        cancelLeft = null;
        break;
      }
    }
  }

  if (cancelLeft) out.push(cancelLeft);
  for (const refund of refunds) {
    if (!mergedRefundIds.has(refund.id)) out.push(refund);
  }
  return out;
}

function parseReconReasonFields(
  reconReason: string,
  reconReasonCategory: string | null | undefined
): { reasonCategory: string | null; comment: string | null } {
  const sepIdx = reconReason.indexOf(RECON_REASON_SEP);
  if (sepIdx >= 0) {
    return {
      reasonCategory: reconReason.slice(0, sepIdx).trim() || null,
      comment: reconReason.slice(sepIdx + RECON_REASON_SEP.length).trim() || null,
    };
  }
  const category = reconReasonCategory?.trim() || null;
  if (category && category !== reconReason.trim()) {
    return { reasonCategory: category, comment: reconReason.trim() || null };
  }
  return { reasonCategory: null, comment: reconReason.trim() || null };
}

function AgentRoleBadge({ role }: { role: string | null | undefined }) {
  const label = role?.trim();
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-700 whitespace-nowrap">
      {label}
    </span>
  );
}

function ReconRiderBlock({
  providerName,
  riderName,
  riderMobile,
  fallbackLabel,
  layout = "stacked",
}: {
  providerName?: string | null;
  riderName?: string | null;
  riderMobile?: string | null;
  fallbackLabel?: string;
  layout?: "stacked" | "inline";
}) {
  const provider = normalizeProviderName(providerName) ?? providerName?.trim() ?? "";
  const name = riderName?.trim() ?? "";
  const mobile = riderMobile?.trim() ?? "";

  if (!provider && !name && !mobile) {
    const label = fallbackLabel?.trim();
    if (!label || label === "Unknown rider") {
      return <span className="text-[12px] text-slate-500">—</span>;
    }
    return <span className="text-[12px] font-medium text-slate-800">{label}</span>;
  }

  if (layout === "inline") {
    return (
      <span className="block min-w-0 text-[12px] leading-snug text-slate-800">
        {buildReconRiderLabel({ providerName, riderName, riderMobile })}
      </span>
    );
  }

  return (
    <div className="min-w-0 space-y-0.5">
      {provider ? (
        <p className="text-[11px] font-semibold text-emerald-800">{provider}</p>
      ) : null}
      {name || mobile ? (
        <p className="text-[12px] text-slate-800">
          {name}
          {name && mobile ? (
            <span className="text-slate-400"> · </span>
          ) : null}
          {mobile ? <span className="font-mono text-[11px] text-slate-600">{mobile}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

function shouldSkipEmbeddedActivityFetch(
  activityRefreshKey: number,
  initialData: unknown[] | null | undefined
): boolean {
  return activityRefreshKey === 0 && initialData != null;
}

function isBenignSidebarFetchError(error: unknown): boolean {
  return isNetworkOrTransientError(error);
}

function formatReconDisplayTime(isoOrDate: string | Date): string {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

type CxNotification = SidebarCxNotification;

export default function OrderRightSidebar({
  order,
  itemCount: itemCountProp,
  initialRemarksCount = 0,
  initialReconsCount = 0,
  initialNotificationsCount = 0,
  initialRemarks,
  initialNotifications,
  initialRecons,
  activityRefreshKey = 0,
  onRoutedToChange,
  orderRefunds = [],
  prefetchedOrderItems = null,
  onPrefetchOrderItems,
  orderCancelledOnTimeline = false,
  orderFullyRefunded = false,
  refundActionsDisabled = false,
  refundRemainingRefundable,
  onRefundCreated,
}: OrderRightSidebarProps) {
  const auth = useAuthOptional();
  const authReady = auth?.authReady ?? false;
  const userEmail = auth?.user?.email ?? null;
  const [remarks, setRemarks] = useState<Remark[]>(initialRemarks ?? []);
  const [remarkType, setRemarkType] = useState<string>("CUSTOMER");
  const [remarkPreset, setRemarkPreset] = useState<string>("");
  const [remarkText, setRemarkText] = useState("");
  const [isLoadingRemarks, setIsLoadingRemarks] = useState(false);
  const [isSavingRemark, setIsSavingRemark] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);

  const [notifications, setNotifications] = useState<CxNotification[]>(
    initialNotifications ?? []
  );
  const [cxTemplates, setCxTemplates] = useState<
    Array<{
      code: string;
      label: string;
      title_template: string;
      body_template: string;
      is_custom?: boolean;
      allow_edit?: boolean;
    }>
  >([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState("");
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const templateMenuRef = useRef<HTMLDivElement | null>(null);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isSavingNotification, setIsSavingNotification] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  const [recons, setRecons] = useState<Recon[]>(initialRecons ?? []);
  const [assignedRiders, setAssignedRiders] = useState<AssignedRiderOption[]>([]);
  const [reconRider, setReconRider] = useState<string>("");
  const [reconReason, setReconReason] = useState<string>("");
  const [reconText, setReconText] = useState("");
  const [isLoadingRecons, setIsLoadingRecons] = useState(false);
  const [isSavingRecon, setIsSavingRecon] = useState(false);
  const [reconError, setReconError] = useState<string | null>(null);
  const [showReconsModal, setShowReconsModal] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editingType, setEditingType] = useState<string>("CUSTOMER");
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [remarkHistory, setRemarkHistory] = useState<Record<string, RemarkEditHistoryEntry[]>>(
    {}
  );
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [showItemsRefundModal, setShowItemsRefundModal] = useState(false);

  const openItemsModal = () => {
    onPrefetchOrderItems?.();
    setShowItemsRefundModal(true);
  };

  useEffect(() => {
    if (order?.id != null) onPrefetchOrderItems?.();
  }, [order?.id, onPrefetchOrderItems]);

  useEffect(() => {
    if (initialRemarks) setRemarks(initialRemarks);
    if (initialNotifications) setNotifications(initialNotifications);
    if (initialRecons) setRecons(initialRecons);
  }, [order.id, activityRefreshKey, initialRemarks, initialNotifications, initialRecons]);

  const remarksCountDisplay = Math.max(
    remarks.length,
    initialRemarksCount,
    initialRemarks?.length ?? 0
  );
  const notificationsCountDisplay = Math.max(
    notifications.length,
    initialNotificationsCount,
    initialNotifications?.length ?? 0
  );
  const reconsCountDisplay = Math.max(
    recons.length,
    initialReconsCount,
    initialRecons?.length ?? 0
  );

  const prefetchedQtyCount =
    prefetchedOrderItems?.items && prefetchedOrderItems.items.length > 0
      ? computeOrderItemQuantityCount({
          items: prefetchedOrderItems.items.filter((i) => i.id > 0),
        })
      : 0;
  const displayItemCount =
    (itemCountProp != null && itemCountProp > 0 ? itemCountProp : null) ??
    (prefetchedQtyCount > 0 ? prefetchedQtyCount : null) ??
    (order.itemCount != null && order.itemCount > 0 ? order.itemCount : null);
  const displayOrderId =
    order.formattedOrderId?.trim() ||
    (order.orderId ? `#${order.orderId}` : `#${order.id}`);
  const etaOrderIdText =
    (order.orderId ? String(order.orderId).trim() : null) ||
    order.formattedOrderId?.trim() ||
    null;
  const deliveryTypeLabel = formatOrderDeliveryTypeLabel(order.deliveryType);
  const initiatedByLabel = formatOrderInitiatedByLabel(
    order.orderSource,
    order.deliveryInitiator
  );
  const showMerchantKpt = shouldShowMerchantUpdatedKpt(
    order.systemKptMinutes,
    order.merchantUpdatedKptMinutes
  );
  const merchantExtraPrepMinutes =
    order.merchantExtraPrepMinutes != null &&
    Number.isFinite(order.merchantExtraPrepMinutes) &&
    order.merchantExtraPrepMinutes > 0
      ? Math.round(order.merchantExtraPrepMinutes)
      : null;
  const showMerchantExtraPrep = merchantExtraPrepMinutes != null;
  const storePrepDelayLive = Boolean(order.storePrepDelayLive);
  const liveStorePrepDelaySeconds = useLiveElapsedSeconds(
    order.storePrepDelayAnchorAt,
    storePrepDelayLive
  );
  const storePrepDelayDisplaySeconds = storePrepDelayLive
    ? liveStorePrepDelaySeconds
    : order.storePrepDelaySeconds;
  const showStorePrepDelay =
    storePrepDelayLive ||
    (order.storePrepDelaySeconds != null && Number.isFinite(order.storePrepDelaySeconds));
  const orderStatusForOtp = (order.currentStatus || order.status || "").toString();
  const pickupOtpDisplay = order.pickupOtp?.trim() || "—";
  const rtoOtpDisplay =
    formatRtoOtpDisplay(orderStatusForOtp, order.rtoOtp?.trim() || null) ?? "—";
  const riderInstructionLines =
    order.riderInstructionsList?.length
      ? order.riderInstructionsList
      : order.deliveryInstructions?.trim()
        ? order.deliveryInstructions
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
  const merchantInstructionLines =
    order.merchantInstructionsList?.filter((s) => s?.trim()) ?? [];
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showCxInstructions, setShowCxInstructions] = useState(false);
  const [showEtaHistory, setShowEtaHistory] = useState(false);
  const [showRejectionHistory, setShowRejectionHistory] = useState(false);

  const rejectionEntries = useMemo(() => {
    let cancellationEntry: (RejectionInfoEntry & { atIso: string | null }) | null = null;
    const refundEntries: Array<RejectionInfoEntry & { atIso: string | null }> = [];

    // A refund row existing does not mean money moved. Only show a refunded
    // amount once it is actually settled, and surface failures explicitly so a
    // cancellation whose refund was rejected can't read as a clean refund.
    const refundState = orderRefundState(orderRefunds);
    const anyRefundAttempted = orderRefunds.length > 0;

    const cancellation = order.cancellationInfo;
    if (hasOrderCancellationInfo(cancellation)) {
      const display = dashboardRejectionCancellationDisplay(cancellation!);
      const cancellationStatus =
        refundState === "refund_failed"
          ? "REFUND FAILED"
          : refundState === "refunded"
            ? cancellation!.refundStatus?.trim() || "REFUNDED"
            : anyRefundAttempted
              ? "REFUND PENDING"
              : cancellation!.refundStatus?.trim() || null;

      cancellationEntry = {
        id: "cancellation",
        kind: "cancellation",
        reason: display.reason,
        detail:
          refundState === "refund_failed"
            ? [display.detail, "Refund was attempted but rejected — no money returned."]
                .filter(Boolean)
                .join(" · ")
            : display.detail,
        source: display.canceledBy,
        by: display.rejectedBy,
        at: formatRejectionAt(cancellation!.cancelledAtIso),
        atIso: cancellation!.cancelledAtIso ?? null,
        rider: null,
        // Only claim an amount once a refund actually settled.
        amount:
          refundState === "refunded"
            ? formatRejectionAmount(cancellation!.refundAmount)
            : null,
        status: cancellationStatus,
      };
    }

    for (const r of orderRefunds) {
      const createdIso = String(r.createdAt ?? "");
      const outcome = classifyRefund(r);
      refundEntries.push({
        id: `refund-${r.id}`,
        kind: "refund",
        reason: r.refundReason?.trim() || "Refund / cancellation",
        detail:
          outcome === "failed"
            ? [r.refundDescription?.trim(), r.failureReason?.trim()]
                .filter(Boolean)
                .join(" · ") || "Refund failed — no money returned."
            : r.refundDescription?.trim() || null,
        source: null,
        by: r.initiatedByEmail?.trim() || null,
        at: formatRejectionAt(createdIso),
        atIso: createdIso || null,
        rider: null,
        amount: outcome === "settled" ? formatRejectionAmount(r.refundAmount) : null,
        status:
          outcome === "failed"
            ? "FAILED"
            : outcome === "settled"
              ? r.refundStatus?.trim() || "REFUNDED"
              : "PENDING",
      });
    }

    return dedupeRejectionEntries(cancellationEntry, refundEntries).sort((a, b) => {
      const aT = Date.parse(String(a.atIso ?? "")) || 0;
      const bT = Date.parse(String(b.atIso ?? "")) || 0;
      if (aT !== bT) return bT - aT;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [order.cancellationInfo, orderRefunds]);

  const showRejectionInfo = rejectionEntries.length > 0;
  const latestRejectionEntry = rejectionEntries[0] ?? null;

  // Auto-hide recon warning after 2 seconds
  useEffect(() => {
    if (!reconError) return;
    const t = setTimeout(() => setReconError(null), 2000);
    return () => clearTimeout(t);
  }, [reconError]);

  const loadRemarks = useCallback(
    async (options?: { force?: boolean; signal?: AbortSignal }) => {
      if (!authReady) return;
      if (
        !options?.force &&
        shouldSkipEmbeddedActivityFetch(activityRefreshKey, initialRemarks)
      ) {
        setIsLoadingRemarks(false);
        return;
      }
      if (options?.signal?.aborted) {
        setIsLoadingRemarks(false);
        return;
      }

      const fetchRemarks = async () =>
        fetch(`/api/orders/${order.id}/remarks`, {
          credentials: "include",
          cache: "no-store",
          signal: options?.signal,
        });

      try {
        setIsLoadingRemarks(true);
        let res = await fetchRemarks();
        if (options?.signal?.aborted) return;
        if (res.status === 401) {
          const synced = await syncServerSessionCookies();
          if (synced && !options?.signal?.aborted) {
            res = await fetchRemarks();
          }
        }
        if (res.status === 503 && !options?.signal?.aborted) {
          await new Promise((r) => setTimeout(r, 400));
          if (!options?.signal?.aborted) {
            res = await fetchRemarks();
          }
        }
        if (options?.signal?.aborted) return;
        if (!res.ok) {
          const text = await res.text();
          let code = "";
          try {
            code = String(JSON.parse(text)?.code ?? "");
          } catch {
            /* ignore */
          }
          if (res.status === 503 || code === "SERVICE_UNAVAILABLE") {
            return;
          }
          if (res.status !== 401 || remarks.length === 0) {
            // eslint-disable-next-line no-console
            console.error("Failed to load remarks", text);
          }
          return;
        }
        const json = await res.json();
        if (options?.signal?.aborted) return;
        const items =
          (json?.data as Parameters<typeof mapRemarksFromApi>[0] | null) ?? [];

        const mapped = mapRemarksFromApi(items, userEmail);

        setRemarks(mapped);

        // Prefetch edit history for all edited remarks so "See history" shows instant (no loading).
        const editedRemarks = mapped.filter((r) => r.editedTimeLabel);
        editedRemarks.forEach((r) => {
          const numericId = Number(r.id);
          if (!Number.isFinite(numericId)) return;
          fetch(`/api/orders/${order.id}/remarks/${numericId}`, {
            credentials: "include",
            cache: "no-store",
            signal: options?.signal,
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
              if (!json?.data) return;
              const items = (json.data as Array<{
                id: number;
                editedAt: string;
                editedByActorType: string;
                editedByActorName: string | null;
                oldRemark: string;
                newRemark: string;
                oldRemarkCategory: string | null;
                newRemarkCategory: string | null;
              }>) ?? [];
              const historyMapped: RemarkEditHistoryEntry[] = items.map((h) => {
                const editedAt = new Date(h.editedAt);
                return {
                  id: h.id,
                  editedAt: editedAt.toISOString(),
                  editedTimeLabel: editedAt.toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  }),
                  editedByActorType: h.editedByActorType,
                  editedByActorName: h.editedByActorName,
                  oldRemark: h.oldRemark,
                  newRemark: h.newRemark,
                  oldRemarkCategory: h.oldRemarkCategory,
                  newRemarkCategory: h.newRemarkCategory,
                };
              });
              setRemarkHistory((prev) => ({ ...prev, [r.id]: historyMapped }));
            })
            .catch(() => {});
        });
      } catch (error) {
        if (options?.signal?.aborted || isBenignSidebarFetchError(error)) return;
        // eslint-disable-next-line no-console
        console.error("Error loading remarks", error);
      } finally {
        setIsLoadingRemarks(false);
      }
    },
    [activityRefreshKey, authReady, initialRemarks, order.id, remarks.length, userEmail]
  );

  const loadNotifications = useCallback(
    async (signal?: AbortSignal) => {
      if (shouldSkipEmbeddedActivityFetch(activityRefreshKey, initialNotifications)) {
        return;
      }
      if (signal?.aborted) return;

      try {
        setIsLoadingNotifications(true);
        let res = await fetch(`/api/orders/${order.id}/notifications`, {
          credentials: "include",
          signal,
        });
        // Transient auth/DB blip — one quiet retry, then silence (same as remarks).
        if (res.status === 503 && !signal?.aborted) {
          await new Promise((r) => setTimeout(r, 400));
          if (!signal?.aborted) {
            res = await fetch(`/api/orders/${order.id}/notifications`, {
              credentials: "include",
              signal,
            });
          }
        }
        if (signal?.aborted) return;
        if (!res.ok) {
          const text = await res.text();
          let code = "";
          try {
            code = String(JSON.parse(text)?.code ?? "");
          } catch {
            /* ignore */
          }
          if (res.status === 503 || code === "SERVICE_UNAVAILABLE") {
            return;
          }
          // eslint-disable-next-line no-console
          console.error("Failed to load notifications", text);
          return;
        }
        const json = await res.json();
        if (signal?.aborted) return;
        const items =
          (json?.data as Parameters<typeof mapNotificationsFromApi>[0] | null) ?? [];

        setNotifications(mapNotificationsFromApi(items));
      } catch (error) {
        if (signal?.aborted || isBenignSidebarFetchError(error)) return;
        // eslint-disable-next-line no-console
        console.error("Error loading notifications", error);
      } finally {
        if (!signal?.aborted) {
          setIsLoadingNotifications(false);
        }
      }
    },
    [activityRefreshKey, initialNotifications, order.id]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/orders/cx-notification-templates", {
          credentials: "include",
        });
        if (cancelled) return;
        if (!res.ok) {
          console.error("Failed to load Cx templates", res.status, await res.text());
          return;
        }
        const json = (await res.json()) as { items?: unknown; success?: boolean };
        if (cancelled) return;
        const items = Array.isArray(json?.items) ? json.items : [];
        setCxTemplates(
          items.filter(
            (t): t is {
              code: string;
              label: string;
              title_template: string;
              body_template: string;
              is_custom?: boolean;
            } =>
              !!t &&
              typeof t === "object" &&
              typeof (t as { code?: unknown }).code === "string" &&
              typeof (t as { label?: unknown }).label === "string" &&
              (t as { code?: string }).code !== "ADMIN_CX_CUSTOM"
          )
        );
      } catch (err) {
        if (!cancelled) console.error("Error loading Cx templates", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!templateMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const el = templateMenuRef.current;
      if (el && !el.contains(event.target as Node)) {
        setTemplateMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTemplateMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [templateMenuOpen]);

  const loadRecons = useCallback(
    async (signal?: AbortSignal) => {
      if (shouldSkipEmbeddedActivityFetch(activityRefreshKey, initialRecons)) {
        return;
      }
      if (signal?.aborted) return;

      try {
        setIsLoadingRecons(true);
        let res = await fetch(`/api/orders/${order.id}/recons`, {
          credentials: "include",
          signal,
        });
        // Transient auth/DB blip under parallel sidebar loads — quiet retry, then silence.
        if (res.status === 503 && !signal?.aborted) {
          await new Promise((r) => setTimeout(r, 400));
          if (!signal?.aborted) {
            res = await fetch(`/api/orders/${order.id}/recons`, {
              credentials: "include",
              signal,
            });
          }
        }
        if (signal?.aborted) return;
        if (!res.ok) {
          const text = await res.text();
          let code = "";
          try {
            code = String(JSON.parse(text)?.code ?? "");
          } catch {
            /* ignore */
          }
          if (res.status === 503 || code === "SERVICE_UNAVAILABLE") {
            return;
          }
          // eslint-disable-next-line no-console
          console.error("Failed to load recons", text);
          return;
        }
        const json = await res.json();
        if (signal?.aborted) return;
        const items = (json?.data as Parameters<typeof mapReconsFromApi>[0] | null) ?? [];

        const mapped = mapReconsFromApi(items);

        setRecons(mapped);

        setAssignedRiders((prev) =>
          mergeAssignedRiderOptions([
            assignedRidersFromReconRecords(items),
            assignedRidersFromOrder(order),
            prev,
          ])
        );
      } catch (error) {
        if (signal?.aborted || isBenignSidebarFetchError(error)) return;
        // eslint-disable-next-line no-console
        console.error("Error loading recons", error);
      } finally {
        if (!signal?.aborted) {
          setIsLoadingRecons(false);
        }
      }
    },
    [activityRefreshKey, initialRecons, order]
  );

  useEffect(() => {
    if (!authReady || order.id == null || !Number.isFinite(order.id)) return;

    const controller = new AbortController();
    const { signal } = controller;

    // Stagger sidebar fetches slightly to avoid auth/DB stampede → transient 503s.
    void loadRemarks({ signal });
    const tNotif = window.setTimeout(() => {
      void loadNotifications(signal);
    }, 120);
    const tRecons = window.setTimeout(() => {
      void loadRecons(signal);
    }, 240);

    return () => {
      controller.abort();
      window.clearTimeout(tNotif);
      window.clearTimeout(tRecons);
    };
  }, [authReady, order.id, activityRefreshKey, loadRemarks, loadNotifications, loadRecons]);

  useEffect(() => {
    if (!authReady || order.id == null || !Number.isFinite(order.id)) return;

    setAssignedRiders(assignedRidersFromOrder(order));
    if (initialRecons?.length) {
      setAssignedRiders((prev) =>
        mergeAssignedRiderOptions([assignedRidersFromSidebarRecons(initialRecons), prev])
      );
    }

    const mergeAssignedRiders = (lists: AssignedRiderOption[][]) => {
      setAssignedRiders((prev) =>
        mergeAssignedRiderOptions([...lists, assignedRidersFromOrder(order), prev])
      );
    };

    const controller = new AbortController();

    const loadAssignments = async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}/rider-assignments`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!res.ok) return;
        const json = await res.json();
        const items =
          (json?.data as Array<{
            id: number;
            riderId: number | null;
            riderName: string | null;
            riderMobile: string | null;
            deliveryProvider: string | null;
          }> | null) ?? [];

        mergeAssignedRiders([assignedRidersFromAssignments(items)]);
      } catch (error) {
        if (controller.signal.aborted || isBenignSidebarFetchError(error)) return;
        // keep order-seeded riders
      }
    };

    const loadActivityLogRiders = async () => {
      try {
        const payload = await fetchRiderActivityLogCached(order.id);
        if (controller.signal.aborted) return;
        mergeAssignedRiders([assignedRidersFromActivityLog(payload.logs)]);
      } catch (error) {
        if (controller.signal.aborted || isBenignSidebarFetchError(error)) return;
        // non-fatal
      }
    };

    void loadAssignments();
    void loadActivityLogRiders();

    return () => {
      controller.abort();
    };
  }, [
    authReady,
    order.id,
    order.riderId,
    order.riderName,
    order.riderMobile,
    order.orderSource,
    initialRecons,
  ]);

  const addRemark = async () => {
    const preset = remarkPreset.trim();
    const typed = remarkText.trim();

    // Build combined remark according to rules
    let text = "";
    if (preset && typed) {
      text = `${preset} !!!!!! ${typed}`;
    } else if (preset) {
      text = preset;
    } else if (typed) {
      text = typed;
    }

    if (!text || isSavingRemark) return;

    const createdTime = new Date();
    const tempId = `temp-${createdTime.getTime()}`;

    const optimisticRemark: Remark = {
      id: tempId,
      type: remarkType,
      content: text,
      actorType: "AGENT",
      actorName: "You",
      actorEmail: userEmail,
      canEdit: !!userEmail,
      createdAtIso: createdTime.toISOString(),
      editedAtIso: null,
      editedTimeLabel: null,
      time: createdTime.toLocaleString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
    };

    setRemarks((prev) => [optimisticRemark, ...prev]);
    setIsSavingRemark(true);

    try {
      const res = await fetch(`/api/orders/${order.id}/remarks`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          remark: text,
          remarkCategory: remarkType,
        }),
      });

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("Failed to save remark", await res.text());
      } else {
        const json = await res.json();
        const saved = json?.data as
          | {
              id: number;
              remark: string;
              remarkCategory: string | null;
              actorType?: string | null;
              actorName?: string | null;
              remarkMetadata?: { actorEmail?: string | null } | null;
              createdAt?: string | Date;
              lastEditedAt?: string | Date | null;
            }
          | undefined;

        const createdFromServer =
          saved && saved.createdAt ? new Date(saved.createdAt as string | Date) : createdTime;

        const edited =
          saved && saved.lastEditedAt ? new Date(saved.lastEditedAt as string | Date) : null;

        const actorEmail =
          typeof saved?.remarkMetadata?.actorEmail === "string"
            ? saved.remarkMetadata.actorEmail
            : optimisticRemark.actorEmail ?? null;

        const canEdit =
          !!actorEmail &&
          !!userEmail &&
          actorEmail.toLowerCase() === userEmail.toLowerCase() &&
          !edited;

        const finalRemark: Remark = {
          id: saved ? String(saved.id) : tempId,
          type: saved?.remarkCategory ?? remarkType,
          content: saved?.remark ?? text,
          actorType: saved?.actorType ?? optimisticRemark.actorType,
          actorName: saved?.actorName ?? optimisticRemark.actorName,
          actorEmail,
          canEdit,
          editedAtIso: edited ? edited.toISOString() : null,
          editedTimeLabel: edited
            ? edited.toLocaleString("en-IN", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : null,
          createdAtIso: saved?.createdAt
            ? (saved.createdAt as string)
            : createdFromServer.toISOString(),
          time: createdFromServer.toLocaleString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
        };

        setRemarks((prev) =>
          prev.map((r) => (r.id === tempId ? finalRemark : r))
        );

        if (actorEmail) {
          onRoutedToChange?.(actorEmail);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error saving remark", error);
      // Roll back optimistic update on error
      setRemarks((prev) => prev.filter((r) => r.id !== tempId));
    } finally {
      setRemarkText("");
      setRemarkPreset("");
      setIsSavingRemark(false);
    }
  };

  const addNotification = async () => {
    if (!selectedTemplateCode || isSavingNotification) return;

    setIsSavingNotification(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateCode: selectedTemplateCode,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setToastMessage(
          typeof json?.error === "string"
            ? json.error
            : "Could not send notification. Please try again."
        );
        return;
      }
      setSelectedTemplateCode("");
      await loadNotifications();
      const routedEmail =
        typeof json?.routedToEmail === "string" && json.routedToEmail.trim()
          ? json.routedToEmail.trim()
          : userEmail;
      if (routedEmail) {
        onRoutedToChange?.(routedEmail);
      }
      setToastMessage("Notification sent successfully");
    } catch {
      setToastMessage("Could not send notification. Please try again.");
    } finally {
      setIsSavingNotification(false);
    }
  };

  const addRecon = async () => {
    const preset = reconReason.trim();
    const typed = reconText.trim();

    let combined = "";
    if (preset && typed) {
      combined = `${preset} !!!!!! ${typed}`;
    } else if (preset) {
      combined = preset;
    } else if (typed) {
      combined = typed;
    }

    if (!reconRider || !combined || isSavingRecon) return;

    const selected = assignedRiders.find((r) => r.id === reconRider);
    if (!selected) return;

    setIsSavingRecon(true);
    setReconError(null);

    try {
      const trackingId =
        order.formattedOrderId ??
        order.orderId ??
        `GMF${order.id.toString().padStart(6, "0")}`;

      const res = await fetch(`/api/orders/${order.id}/recons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantStoreId: order.merchantStoreId ?? null,
          providerName: normalizeProviderName(selected.providerName ?? order.orderSource) ?? selected.providerName ?? order.orderSource ?? null,
          trackingId,
          riderId: selected.riderId ?? null,
          riderName: selected.riderName ?? null,
          riderMobile: selected.riderMobile ?? null,
          reasonPreset: preset || null,
          reasonText: typed || null,
        }),
      });

      const responseText = await res.text();
      if (!res.ok) {
        try {
          const body = JSON.parse(responseText);
          if (body.code === "RECON_ALREADY_EXISTS") {
            setReconError(
              "You can't add recon for the same rider twice. Try with a different rider if needed."
            );
            return;
          }
        } catch {
          // not JSON or other error
        }
        // eslint-disable-next-line no-console
        console.error("Failed to save recon", responseText);
        setReconError("Failed to save recon. Please try again.");
        return;
      }

      const json = JSON.parse(responseText);
      const saved = json?.data as
        | {
            id: number;
            riderId?: number | null;
            providerName: string | null;
            trackingId: string | null;
            riderName: string | null;
            riderMobile: string | null;
            actorEmail?: string | null;
            actorRole?: string | null;
            reconReason: string;
            reconReasonCategory?: string | null;
            reconAt: string | Date;
          }
        | undefined;

      if (!saved) return;

      const created =
        saved.reconAt instanceof Date
          ? saved.reconAt
          : new Date(saved.reconAt);

      const { reasonCategory, comment } = parseReconReasonFields(
        saved.reconReason,
        saved.reconReasonCategory
      );
      const mapped: Recon = {
        id: String(saved.id),
        providerName: saved.providerName,
        riderName: saved.riderName,
        riderMobile: saved.riderMobile,
        rider: buildReconRiderLabel({
          providerName: normalizeProviderName(saved.providerName) ?? saved.providerName,
          riderName: saved.riderName,
          riderMobile: saved.riderMobile,
        }),
        reason: saved.reconReason,
        reasonCategory,
        comment,
        time: formatReconDisplayTime(created),
        actorEmail: saved.actorEmail ?? userEmail,
        actorRole: saved.actorRole ?? null,
      };

      setRecons((prev) => [mapped, ...prev.filter((r) => r.id !== mapped.id)]);
      // Add new rider to dropdown if not already present
      const newAssignedRiderId = saved.riderId;
      if (
        newAssignedRiderId != null &&
        !assignedRiders.some(
          (a) => a.riderId === newAssignedRiderId || a.id === String(newAssignedRiderId)
        )
      ) {
        setAssignedRiders((prev) => [
          ...prev,
          {
            id: String(newAssignedRiderId),
            riderId: newAssignedRiderId,            riderName: saved.riderName ?? null,
            riderMobile: saved.riderMobile ?? null,
            providerName: normalizeProviderName(saved.providerName) ?? saved.providerName ?? null,
          },
        ]);
      }
      const routedEmail =
        typeof json?.routedToEmail === "string" && json.routedToEmail.trim()
          ? json.routedToEmail.trim()
          : mapped.actorEmail;
      if (routedEmail) {
        onRoutedToChange?.(routedEmail);
      }
      setReconText("");
      setReconReason("");
      setReconRider("");
      setReconError(null);
    } finally {
      setIsSavingRecon(false);
    }
  };

  const openCxInstructions = () => {
    setShowCxInstructions(true);
  };

  const startEditRemark = (remark: Remark) => {
    if (!remark.canEdit || remark.id.startsWith("temp-")) return;

    // Extra safety: enforce 15-minute window on client as well
    if (remark.createdAtIso) {
      const created = new Date(remark.createdAtIso);
      const diff = Date.now() - created.getTime();
      const FIFTEEN_MIN_MS = 15 * 60 * 1000;
      if (diff > FIFTEEN_MIN_MS) {
        return;
      }
    }

    setEditingRemarkId(remark.id);
    setEditingText(remark.content);
    setEditingType(remark.type);
  };

  const saveEditRemark = async (remark: Remark) => {
    const text = editingText.trim();
    if (!editingRemarkId || !text || isSavingEdit) return;

    const numericId = Number(remark.id);
    if (!Number.isFinite(numericId)) return;

    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks/${numericId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remark: text,
          remarkCategory: editingType,
        }),
      });

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("Failed to edit remark", await res.text());
        return;
      }

      const json = await res.json();
      const saved = json?.data as
        | {
            id: number;
            remark: string;
            remarkCategory: string | null;
            actorType?: string | null;
            actorName?: string | null;
            remarkMetadata?: { actorEmail?: string | null } | null;
            createdAt?: string | Date;
            lastEditedAt?: string | Date | null;
          }
        | undefined;

      if (!saved) return;

      const created = saved.createdAt ? new Date(saved.createdAt as string | Date) : new Date();
      const edited = saved.lastEditedAt ? new Date(saved.lastEditedAt as string | Date) : null;

      const actorEmail =
        typeof saved.remarkMetadata?.actorEmail === "string"
          ? saved.remarkMetadata.actorEmail
          : remark.actorEmail ?? null;

      const canEditRemark = false;

      const updatedRemark: Remark = {
        id: String(saved.id),
        type: saved.remarkCategory ?? editingType,
        content: saved.remark,
        actorType: saved.actorType ?? remark.actorType ?? null,
        actorName: saved.actorName ?? remark.actorName ?? null,
        actorEmail,
        canEdit: canEditRemark,
        createdAtIso: created.toISOString(),
        time: created.toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        editedAtIso: edited ? edited.toISOString() : remark.editedAtIso ?? null,
        editedTimeLabel: edited
          ? edited.toLocaleString("en-IN", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          : remark.editedTimeLabel ?? null,
      };

      setRemarks((prev) => prev.map((r) => (r.id === remark.id ? updatedRemark : r)));
      setEditingRemarkId(null);
      setEditingText("");
      setEditingType("CUSTOMER");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error editing remark", error);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toggleHistoryForRemark = async (remark: Remark) => {
    if (!remark.editedAtIso) return;
    if (openHistoryId === remark.id) {
      setOpenHistoryId(null);
      return;
    }

    // If we already have history loaded, just toggle open
    if (remarkHistory[remark.id]) {
      setOpenHistoryId(remark.id);
      return;
    }

    const numericId = Number(remark.id);
    if (!Number.isFinite(numericId)) return;

    setHistoryLoadingId(remark.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks/${numericId}`);
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("Failed to load remark history", await res.text());
        return;
      }
      const json = await res.json();
      const items =
        (json?.data as Array<{
          id: number;
          editedAt: string;
          editedByActorType: string;
          editedByActorName: string | null;
          oldRemark: string;
          newRemark: string;
          oldRemarkCategory: string | null;
          newRemarkCategory: string | null;
        }> | null) ?? [];

      const mapped: RemarkEditHistoryEntry[] = items.map((h) => {
        const editedAt = new Date(h.editedAt);
        return {
          id: h.id,
          editedAt: editedAt.toISOString(),
          editedTimeLabel: editedAt.toLocaleString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          editedByActorType: h.editedByActorType,
          editedByActorName: h.editedByActorName,
          oldRemark: h.oldRemark,
          newRemark: h.newRemark,
          oldRemarkCategory: h.oldRemarkCategory,
          newRemarkCategory: h.newRemarkCategory,
        };
      });

      setRemarkHistory((prev) => ({ ...prev, [remark.id]: mapped }));
      setOpenHistoryId(remark.id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error loading remark history", error);
    } finally {
      setHistoryLoadingId(null);
    }
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  return (
    <>
    <aside className="w-full space-y-3 text-[12px] text-slate-600">
      {/* Order details card — compact labels & spacing */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="flex items-center gap-1 text-[12px] font-semibold text-slate-800">
            <i className="bi bi-info-circle text-[11px] text-emerald-500" />
            Order details
          </h3>
        </div>
        <dl className="mt-1.5 flex flex-col gap-1.5 text-[11px] text-slate-600">
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Items:</dt>
            <dd className="flex min-w-0 items-center justify-end gap-1.5 font-medium text-slate-700">
              <OrderNum>({displayItemCount ?? "—"})</OrderNum>
              <span
                role="button"
                tabIndex={0}
                className="cursor-pointer text-emerald-600 hover:text-emerald-700"
                onPointerEnter={() => onPrefetchOrderItems?.()}
                onClick={openItemsModal}
                onKeyDown={(e) => e.key === "Enter" && openItemsModal()}
              >
                <i className="bi bi-eye" /> View
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Assign before accept:</dt>
            <dd>
              <span className="inline-block rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                False
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Distance:</dt>
            <dd className="font-medium text-slate-700">
              {order.distanceKm != null ? (
                <OrderMixedText>{formatOrderDistanceKmLabel(order.distanceKm)}</OrderMixedText>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Scheduled order:</dt>
            <dd className="font-medium text-slate-700">
              {formatScheduledOrderLabel(Boolean(order.isScheduledOrder))}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Delivery type:</dt>
            <dd>
              {deliveryTypeLabel !== "—" ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                  {deliveryTypeLabel}
                </span>
              ) : (
                <span className="font-medium text-slate-700">—</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Initiated by:</dt>
            <dd className="font-medium text-slate-700">{initiatedByLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Locality:</dt>
            <dd>
              {order.localityIsSafe === false ? (
                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-100">
                  RED
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                  GREEN
                </span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">System KPT:</dt>
            <dd
              className={`font-medium orders-num ${
                showMerchantKpt
                  ? "text-slate-400 line-through decoration-slate-400"
                  : "text-slate-700"
              }`}
            >
              {formatKptMinutes(order.systemKptMinutes)}
            </dd>
          </div>
          {showMerchantKpt ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="shrink-0">Merchant updated KPT:</dt>
              <dd className="font-medium text-slate-700 orders-num">
                {formatKptMinutes(order.merchantUpdatedKptMinutes)}
              </dd>
            </div>
          ) : null}
          {showMerchantExtraPrep ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="shrink-0" title="Merchant used Need more time while preparing">
              Kitchen Delay Buffer (MX):
              </dt>
              <dd>
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200 orders-num">
                  {formatMerchantExtraPrepMinutes(merchantExtraPrepMinutes)}
                </span>
              </dd>
            </div>
          ) : null}
          {showStorePrepDelay ? (
            <div className="flex items-center justify-between gap-2">
              <dt
                className="shrink-0"
                title="Time merchant was late marking ready after committed KPT deadline"
              >
                Mx preparation Delay
              </dt>
              <dd>
                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800 ring-1 ring-red-200 orders-num">
                  {formatDurationSecondsLabel(storePrepDelayDisplaySeconds, {
                    live: storePrepDelayLive,
                    onTimeLabel: "0:00:00",
                  })}
                </span>
              </dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Contactless:</dt>
            <dd>
              {order.contactlessDelivery === true ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                  TRUE
                </span>
              ) : order.contactlessDelivery === false ? (
                <span className="inline-block rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                  FALSE
                </span>
              ) : (
                <span className="font-medium text-slate-700">—</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Acceptance Source:</dt>
            <dd className="min-w-0 text-right font-medium text-slate-700">
              {order.acceptanceSource ? (
                <OrderMixedText>{order.acceptanceSource}</OrderMixedText>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Order ID:</dt>
            <dd className="min-w-0 truncate font-medium text-slate-700 text-right orders-num">
              {displayOrderId}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">First ETA:</dt>
            <dd className="min-w-0 text-right orders-num">
              <button
                type="button"
                onClick={() => setShowEtaHistory(true)}
                disabled={!etaOrderIdText}
                title="Open ETA audit history"
                className="cursor-pointer font-medium text-slate-700 no-underline hover:text-emerald-700 hover:no-underline disabled:cursor-default disabled:opacity-60"
              >
                {formatFirstEtaAt(
                  order.firstEtaAt ??
                    // Never fall back to estimated_delivery_time — that is the live/current ETA.
                    (order.etaSeconds != null &&
                    order.createdAt &&
                    Number.isFinite(order.etaSeconds)
                      ? new Date(
                          new Date(order.createdAt).getTime() +
                            Number(order.etaSeconds) * 1000
                        ).toISOString()
                      : null)
                )}
              </button>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">CX Instructions:</dt>
            <dd>
              <span
                className="cursor-pointer font-medium text-emerald-600 hover:text-emerald-700"
                onClick={openCxInstructions}
                onKeyDown={(e) => e.key === "Enter" && openCxInstructions()}
                role="button"
                tabIndex={0}
              >
                <i className="bi bi-chat-left-text" /> View
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 shrink-0 whitespace-nowrap text-[11px] leading-snug">
              <span className="font-medium text-slate-600">Pickup OTP - </span>
              <span className="font-mono font-semibold tracking-wide text-emerald-700">
                {pickupOtpDisplay}
              </span>
            </p>
            <p className="min-w-0 truncate whitespace-nowrap text-right text-[11px] leading-snug">
              <span className="font-medium text-slate-600">RTO OTP - </span>
              <span className="font-mono font-semibold tracking-wide text-emerald-700">
                {rtoOtpDisplay}
              </span>
            </p>
          </div>
        </dl>
      </section>

      {/* Create refund CTA - opens Items / Refund modal */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <button
          type="button"
          disabled={refundActionsDisabled}
          title={
            refundActionsDisabled
              ? "Order is already cancelled and fully refunded — no further refund or cancellation is possible."
              : undefined
          }
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium text-white shadow-sm transition ${
            refundActionsDisabled
              ? "cursor-not-allowed bg-slate-300"
              : "cursor-pointer bg-emerald-500 hover:bg-emerald-600"
          }`}
          onPointerEnter={() => {
            if (!refundActionsDisabled) onPrefetchOrderItems?.();
          }}
          onClick={() => {
            if (!refundActionsDisabled) openItemsModal();
          }}
        >
          <i className="bi bi-arrow-counterclockwise" />
          Create refund
        </button>
        {refundActionsDisabled && (
          <p className="mt-2 text-center text-[11px] leading-snug text-slate-500">
            Order cancelled &amp; fully refunded.
          </p>
        )}
      </section>

      {/* Add remarks */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
            <i className="bi bi-chat-left-dots text-emerald-500" />
            Add remarks
          </h3>
          <button
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
            onClick={() => {
              setShowRemarksModal(true);
              void loadRemarks({ force: remarks.length === 0 });
            }}
          >
            <i className="bi bi-list-check" />
            <OrderMixedText>{`See all (${remarksCountDisplay})`}</OrderMixedText>
          </button>
        </div>
        <div className="space-y-2">
          <select
            value={remarkType}
            onChange={(e) => {
              setRemarkType(e.target.value);
              setRemarkPreset("");
            }}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="CUSTOMER">CUSTOMER</option>
            <option value="MERCHANT">MERCHANT</option>
            <option value="RIDER">RIDER</option>
            <option value="OTHER">OTHER</option>
          </select>
          <select
            value={remarkPreset}
            onChange={(e) => {
              setRemarkPreset(e.target.value);
            }}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Option</option>
            {(STANDARD_REMARKS[remarkType as keyof typeof STANDARD_REMARKS] || []).map((remark) => (
              <option key={remark} value={remark}>
                {remark}
              </option>
            ))}
          </select>
          <textarea
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder="Add your comment here..."
            className="min-h-[60px] w-full rounded border border-slate-200 bg-white p-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            onClick={addRemark}
            disabled={isSavingRemark}
            className={`mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm transition ${
              isSavingRemark ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:bg-emerald-600"
            }`}
          >
            {isSavingRemark ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-white border-r-transparent" />
                Saving...
              </>
            ) : (
              <>
                <i className="bi bi-send" />
                Submit
              </>
            )}
          </button>
        </div>
      </section>

      {/* Send customer notification */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
            <i className="bi bi-bell text-emerald-500" />
            Send Cx notification
          </h3>
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
            onClick={() => setShowNotificationsModal(true)}
          >
            <i className="bi bi-list-check" />
            <OrderMixedText>{`See all (${notificationsCountDisplay})`}</OrderMixedText>
          </button>
        </div>
        <div className="w-full space-y-2">
          <div className="relative" ref={templateMenuRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={templateMenuOpen}
              onClick={() => setTemplateMenuOpen((open) => !open)}
              className="flex min-h-8 w-full items-start justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[12px] leading-snug text-slate-700 hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <span className="whitespace-normal break-words">
                {cxTemplates.find((t) => t.code === selectedTemplateCode)?.label ||
                  "Select notification"}
              </span>
              <i
                className={`bi bi-chevron-down mt-0.5 shrink-0 text-[10px] text-slate-400 transition ${
                  templateMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {templateMenuOpen ? (
              <ul
                role="listbox"
                className="absolute left-0 right-0 z-30 mt-1 max-h-40 w-full overflow-y-auto rounded border border-slate-200 bg-white py-1 shadow-md"
              >
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={!selectedTemplateCode}
                    onClick={() => {
                      setSelectedTemplateCode("");
                      setTemplateMenuOpen(false);
                    }}
                    className={`block w-full whitespace-normal break-words px-2.5 py-1.5 text-left text-[11px] leading-snug hover:bg-emerald-50 ${
                      !selectedTemplateCode
                        ? "bg-emerald-50 font-medium text-emerald-700"
                        : "text-slate-600"
                    }`}
                  >
                    Select notification
                  </button>
                </li>
                {cxTemplates.map((t) => (
                  <li key={t.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedTemplateCode === t.code}
                      onClick={() => {
                        setSelectedTemplateCode(t.code);
                        setTemplateMenuOpen(false);
                      }}
                      className={`block w-full whitespace-normal break-words px-2.5 py-1.5 text-left text-[11px] leading-snug hover:bg-emerald-50 ${
                        selectedTemplateCode === t.code
                          ? "bg-emerald-50 font-medium text-emerald-700"
                          : "text-slate-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void addNotification()}
            disabled={isSavingNotification || !selectedTemplateCode}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm transition hover:bg-emerald-600 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSavingNotification ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-white border-r-transparent" />
                Sending...
              </>
            ) : (
              <>
                <i className="bi bi-send" />
                Send notification
              </>
            )}
          </button>
        </div>
      </section>

      {/* Rider recon + rejection info */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
            <ClipboardCheck className="h-4 w-4 text-emerald-500" />
            Rider Recon
          </h3>
          <button
            type="button"
            className="text-xs text-emerald-700 hover:text-emerald-800 cursor-pointer underline-offset-2 hover:underline"
            onClick={() => setShowReconsModal(true)}
          >
            <OrderMixedText>{`See all (${reconsCountDisplay})`}</OrderMixedText>
          </button>
        </div>
        <div className="space-y-2">
          <select
            value={reconRider}
            onChange={(e) => {
              setReconRider(e.target.value);
              setReconError(null);
            }}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Rider Option</option>
            {(() => {
              const seenLabels = new Set<string>();
              return assignedRiders.map((r) => {
                const label = buildReconRiderLabel({
                  providerName: r.providerName,
                  riderName: r.riderName,
                  riderMobile: r.riderMobile,
                });
                if (label === "Unknown rider" || seenLabels.has(label)) return null;
                seenLabels.add(label);
                return (
                  <option key={riderOptionDedupeKey(r)} value={r.id}>
                    {label}
                  </option>
                );
              });
            })()}
          </select>
          <select
            value={reconReason}
            onChange={(e) => setReconReason(e.target.value)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Rejection Option (Optional)</option>
            <option value="Customer denying order">Customer denying order</option>
            <option value="LP Assignment Timeout">LP Assignment Timeout</option>
            <option value="Merchant non-responsive">Merchant non-responsive</option>
            <option value="Merchant denying order">Merchant denying order</option>
            <option value="Items out of stock">Items out of stock</option>
            <option value="Not operational today">Not operational today</option>
            <option value="Customer non-responsive">Customer non-responsive</option>
            <option value="Nearing closing time">Nearing closing time</option>
            <option value="Duplicate Order">Duplicate Order</option>
            <option value="Delay in order acceptance">Delay in order acceptance</option>
            <option value="Poor quality of packaging">Poor quality of packaging</option>
            <option value="Poor quality">Poor quality</option>
            <option value="Wrong order">Wrong order</option>
            <option value="Foreign object in food / FSSAI issue">
              Foreign object in food / FSSAI issue
            </option>
            <option value="Missing item">Missing item</option>
            <option value="Customer reject due to delay">
              Customer reject due to delay
            </option>
            <option value="FE - No answer">FE - No answer</option>
            <option value="Denial - Pickup timeout">Denial - Pickup timeout</option>
            <option value="Food not delivered">Food not delivered</option>
            <option value="Instructions not followed">Instructions not followed</option>
            <option value="PG failure">PG failure</option>
            <option value="Denial - Rider abusive">Denial - Rider abusive</option>
            <option value="Merchant charging extra amount">
              Merchant charging extra amount
            </option>
            <option value="Merchant device issue">Merchant device issue</option>
            <option value="Nearing opening time">Nearing opening time</option>
            <option value="Kitchen is full">Kitchen is full</option>
            <option value="Out of subzone / area">Out of subzone / area</option>
            <option value="Unsafe area">Unsafe area</option>
            <option value="FE - Accident / Rain / Strike / Vehicle issue">
              FE - Accident / Rain / Strike / Vehicle issue
            </option>
            <option value="Wrong user address">Wrong user address</option>
            <option value="FE - Device / App issue">FE - Device / App issue</option>
            <option value="FE - Long distance order">FE - Long distance order</option>
            <option value="Auto cancelled">Auto cancelled</option>
            <option value="Product outside deals-in">Product outside deals-in</option>
            <option value="Auto cancellation - Bill not generated">
              Auto cancellation - Bill not generated
            </option>
            <option value="Incorrect merchant address">Incorrect merchant address</option>
            <option value="Customer placed order by mistake">
              Customer placed order by mistake
            </option>
            <option value="Someone else picked the order">
              Someone else picked the order
            </option>
            <option value="Rider fled with the order">
              Rider fled with the order
            </option>
            <option value="Customer ordering in bulk">Customer ordering in bulk</option>
            <option value="Invalid prescription">Invalid prescription</option>
            <option value="Prescription missing">Prescription missing</option>
            <option value="Issue with pricing">Issue with pricing</option>
            <option value="Rider charging extra">Rider charging extra</option>
            <option value="Expired items">Expired items</option>
            <option value="Order damaged during delivery">
              Order damaged during delivery
            </option>
            <option value="Merchant delaying the order (High wait time)">
              Merchant delaying the order (High wait time)
            </option>
            <option value="Someone else picked the order (Same 3PL)">
              Someone else picked the order (Same 3PL)
            </option>
            <option value="Someone else picked the order (Different 3PL)">
              Someone else picked the order (Different 3PL)
            </option>
            <option value="Merchant handed over the order to someone else">
              Merchant handed over the order to someone else
            </option>
            <option value="Rider denying to pickup food">
              Rider denying to pickup food
            </option>
          </select>
          <textarea
            value={reconText}
            onChange={(e) => setReconText(e.target.value)}
            placeholder="Add your recon comment here... (Required if rejection option not selected)"
            className="min-h-[60px] w-full rounded border border-slate-200 bg-white p-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {reconError && (
            <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
              {reconError}
            </p>
          )}
          <button
            type="button"
            onClick={addRecon}
            disabled={isSavingRecon}
            className={`mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm transition ${
              isSavingRecon ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:bg-emerald-600"
            }`}
          >
            {isSavingRecon ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-white border-r-transparent" />
                Saving...
              </>
            ) : (
              <>
                <i className="bi bi-check-circle" />
                Submit Recon
              </>
            )}
          </button>
        </div>

        {showRejectionInfo && latestRejectionEntry ? (
        <div className="mt-3 rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <h3 className="text-[13px] font-semibold text-slate-800 tracking-tight">
              Rejection Info
            </h3>
            {rejectionEntries.length > 1 ? (
              <button
                type="button"
                onClick={() => setShowRejectionHistory(true)}
                className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
              >
                view ({rejectionEntries.length})
              </button>
            ) : null}
          </div>
          <div className="p-3">
            <RejectionInfoEntryCard entry={latestRejectionEntry} />
          </div>
        </div>
        ) : null}
      </section>

      {/* All remarks modal */}
      {showRemarksModal && (
        <OrderPageOverlay className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-2">
          <div className="w-full max-w-3xl rounded-xl bg-[#f1faf5] shadow-xl border border-emerald-100">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                <h2 className="text-[14px] font-semibold text-slate-800">
                  All Remarks
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-emerald-50 cursor-pointer"
                onClick={() => setShowRemarksModal(false)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Modal body */}
            <div className="max-h-[440px] overflow-y-auto px-5 py-3 bg-white rounded-b-xl">
              {isLoadingRemarks && remarks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Loading remarks...
                </div>
              ) : remarks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No remarks added yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {remarks.map((r) => (
                    <div
                      key={r.id}
                      className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      {/* Top row: avatar + name + badges + timestamp */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <div className="mt-[2px] text-slate-400">
                            <UserCircle2 className="h-4 w-4" />
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold text-slate-800">
                                {r.actorName || "Agent"}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-700">
                                {r.actorType || "Agent"}
                              </span>
                              {r.actorEmail && (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-600">
                                  {r.actorEmail}
                                </span>
                              )}
                              {/* Customer / Merchant / Rider / Other tag in same row */}
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ${
                                  r.type === "CUSTOMER"
                                    ? "bg-emerald-600 text-white"
                                    : r.type === "RIDER"
                                      ? "bg-sky-600 text-white"
                                      : r.type === "MERCHANT"
                                        ? "bg-amber-600 text-white"
                                        : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {r.type}
                              </span>
                            </div>
                            {/* Remark text aligned with name (right of avatar) */}
                            {editingRemarkId === r.id ? (
                              <div className="mt-1 w-full max-w-[620px] space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] text-slate-500">Category:</span>
                                  <select
                                    value={editingType}
                                    onChange={(e) => setEditingType(e.target.value)}
                                    className="h-7 rounded border border-emerald-200 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                                  >
                                    <option value="CUSTOMER">CUSTOMER</option>
                                    <option value="MERCHANT">MERCHANT</option>
                                    <option value="RIDER">RIDER</option>
                                    <option value="OTHER">OTHER</option>
                                  </select>
                                </div>
                                <textarea
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  className="w-full rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  rows={3}
                                />
                              </div>
                            ) : (
                              <div className="mt-1 text-[12px] leading-relaxed text-slate-700 whitespace-pre-line">
                                {r.content}
                              </div>
                            )}
                            {r.editedTimeLabel && (
                              <div className="mt-0.5 text-[10px] text-slate-400">
                                <OrderMixedText>{`Edited ${r.editedTimeLabel}`}</OrderMixedText>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500 whitespace-nowrap">
                          <OrderNum>{r.time}</OrderNum>
                        </div>
                      </div>

                      {/* Edit / history actions */}
                      <div className="mt-1 flex items-center justify-end gap-3 text-[10px]">
                        {r.editedTimeLabel && (
                          <button
                            type="button"
                            onClick={() => toggleHistoryForRemark(r)}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium cursor-pointer ${
                              openHistoryId === r.id
                                ? "text-red-600 hover:bg-red-50"
                                : "text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {openHistoryId === r.id ? (
                              <>
                                <span>Hide history</span>
                                <span className="text-[9px]">▴</span>
                              </>
                            ) : (
                              <>
                                <span>See history</span>
                                <span className="text-[9px]">▾</span>
                              </>
                            )}
                          </button>
                        )}

                        {r.canEdit && (
                          <>
                            {editingRemarkId === r.id ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isSavingEdit}
                                  onClick={() => saveEditRemark(r)}
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 cursor-pointer"
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span>Save</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isSavingEdit}
                                  onClick={() => {
                                    setEditingRemarkId(null);
                                    setEditingText("");
                                    setEditingType("CUSTOMER");
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-70 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditRemark(r)}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                              >
                                <Pencil className="h-3 w-3" />
                                <span>Edit</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {/* History panel (only when edited and toggled) */}
                      {r.editedTimeLabel && openHistoryId === r.id && remarkHistory[r.id] && (
                        <div className="mt-2 rounded border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                          {remarkHistory[r.id].length === 0 ? (
                            <div className="text-[10px] text-slate-500">
                              No history entries found.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {remarkHistory[r.id].map((h) => (
                                <div key={h.id} className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
                                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                                    <span>
                                      Edited by{" "}
                                      <span className="font-medium text-slate-700">
                                        {h.editedByActorName || h.editedByActorType}
                                      </span>
                                    </span>
                                    <span>{h.editedTimeLabel}</span>
                                  </div>
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <div>
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[10px] font-semibold text-slate-500">
                                          Old remark
                                        </span>
                                        {h.oldRemarkCategory && (
                                          <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold bg-slate-100 text-slate-700">
                                            {h.oldRemarkCategory}
                                          </span>
                                        )}
                                      </div>
                                      <div className="rounded bg-white px-2 py-1 text-[11px] text-slate-700 whitespace-pre-line border border-slate-100">
                                        {h.oldRemark}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[10px] font-semibold text-slate-500">
                                          New remark
                                        </span>
                                        {h.newRemarkCategory && (
                                          <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold bg-slate-100 text-slate-700">
                                            {h.newRemarkCategory}
                                          </span>
                                        )}
                                      </div>
                                      <div className="rounded bg-white px-2 py-1 text-[11px] text-slate-700 whitespace-pre-line border border-slate-100">
                                        {h.newRemark}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </OrderPageOverlay>
      )}

      {/* All CX notifications modal */}
      {showNotificationsModal && (
        <OrderPageOverlay className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-2">
          <div className="w-full max-w-3xl rounded-xl bg-[#f1faf5] shadow-xl border border-emerald-100">
            <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-emerald-500" />
                <h2 className="text-[14px] font-semibold text-slate-800">
                  All Cx Notifications
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-emerald-50 cursor-pointer"
                onClick={() => setShowNotificationsModal(false)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-[440px] overflow-y-auto px-5 py-3 bg-white rounded-b-xl">
              {isLoadingNotifications ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No notifications sent yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <div className="mt-[2px] text-slate-400">
                            <UserCircle2 className="h-4 w-4" />
                          </div>
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold text-slate-800">
                                {n.actorName || "Agent"}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-700">
                                {n.actorType || "AGENT"}
                              </span>
                              {n.actorEmail ? (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-600">
                                  {n.actorEmail}
                                </span>
                              ) : null}
                              <span className="inline-flex items-center rounded-full bg-sky-600 px-2 py-[2px] text-[9px] font-semibold text-white">
                                CUSTOMER
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              {n.title ? (
                                <p className="text-[12px] font-semibold leading-snug text-slate-900">
                                  Title: {n.title}
                                </p>
                              ) : null}
                              <p className="text-[12px] leading-relaxed text-slate-700 whitespace-pre-line">
                                {n.body ?? n.message}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                          <OrderNum>{n.time}</OrderNum>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </OrderPageOverlay>
      )}

      {/* All recons modal */}
      {showReconsModal && (
        <OrderPageOverlay className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-3 py-4">
          <div className="flex max-h-[min(90vh,640px)] w-full max-w-5xl flex-col rounded-xl bg-[#f1faf5] shadow-xl border border-emerald-100">
            <div className="flex shrink-0 items-center justify-between px-5 py-3 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-[14px] font-semibold text-slate-800">
                  All Recons
                  {!isLoadingRecons && recons.length > 0 ? (
                    <span className="ml-1.5 font-normal text-slate-500">({recons.length})</span>
                  ) : null}
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-emerald-50 cursor-pointer"
                onClick={() => setShowReconsModal(false)}
                aria-label="Close"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white rounded-b-xl px-4 py-3 sm:px-5 sm:py-4">
              {isLoadingRecons ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading recons...</div>
              ) : recons.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">No recons available.</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-max min-w-full table-auto divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600">
                          Rider
                        </th>
                        <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600">
                          Date &amp; time
                        </th>
                        <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600">
                          Rejection option
                        </th>
                        <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600">
                          Reason / comment
                        </th>
                        <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-gray-600">
                          Submitted by
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {recons.map((r) => {
                        const rejectionOption = r.reasonCategory?.trim() || null;
                        const commentText =
                          r.comment?.trim() ||
                          (!rejectionOption ? r.reason?.trim() : null) ||
                          null;

                        return (
                          <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 align-top text-[11px] text-gray-900 border-r border-gray-100 min-w-[11rem]">
                              <ReconRiderBlock
                                providerName={r.providerName}
                                riderName={r.riderName}
                                riderMobile={r.riderMobile}
                                fallbackLabel={r.rider}
                                layout="inline"
                              />
                            </td>
                            <td className="px-3 py-2 align-top whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100 orders-num">
                              {r.time}
                            </td>
                            <td className="px-3 py-2 align-top text-[11px] text-gray-900 border-r border-gray-100 min-w-[9rem]">
                              {rejectionOption ?? (
                                <span className="text-gray-400">Not selected</span>
                              )}
                            </td>
                            <td className="px-3 py-2 align-top text-[11px] text-gray-900 border-r border-gray-100 min-w-[10rem] max-w-[18rem]">
                              {commentText ? (
                                <span className="whitespace-pre-line">{commentText}</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 align-top text-[11px] text-gray-900 min-w-[8.5rem]">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {r.actorEmail ? (
                                  <span className="break-all" title={r.actorEmail}>
                                    {r.actorEmail}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                                <AgentRoleBadge role={r.actorRole} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </OrderPageOverlay>
      )}
    </aside>

    {/* Items / Refund modal - opened by View Items or Create refund */}
    <ItemsRefundModal
      isOpen={showItemsRefundModal}
      onClose={() => setShowItemsRefundModal(false)}
      onToast={(msg) => setToastMessage(msg)}
      orderId={order.id}
      prefetchedOrderItems={prefetchedOrderItems}
      orderCancelledOnTimeline={orderCancelledOnTimeline}
      orderFullyRefunded={orderFullyRefunded}
      refundActionsDisabled={refundActionsDisabled}
      refundRemainingRefundable={refundRemainingRefundable}
      onRefundCreated={onRefundCreated}
    />

    <OrderEtaHistorySideSheet
      open={showEtaHistory}
      onClose={() => setShowEtaHistory(false)}
      orderIdText={etaOrderIdText}
    />

    <RejectionInfoSideSheet
      open={showRejectionHistory}
      onClose={() => setShowRejectionHistory(false)}
      orderIdText={
        order.formattedOrderId?.trim() ||
        (order.orderId ? String(order.orderId).trim() : null)
      }
      entries={rejectionEntries}
    />

    {showCxInstructions && (
      <OrderPageOverlay
        className="fixed inset-0 z-[210] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        onBackdropClick={(e) => {
          if (e.target === e.currentTarget) setShowCxInstructions(false);
        }}
      >
        <div
          className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-5 text-[12px] text-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <i className="bi bi-chat-left-text text-[14px]" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">CX Instructions</h2>
              </div>
            </div>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
              onClick={() => setShowCxInstructions(false)}
            >
              ✕
            </button>
          </div>

          <div className="mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50/60 p-3">
            {riderInstructionLines.length === 0 && merchantInstructionLines.length === 0 ? (
              <p className="text-[12px] text-slate-500">
                No instructions for this order.
              </p>
            ) : (
              <div
                className={`grid gap-3 ${
                  riderInstructionLines.length > 0 && merchantInstructionLines.length > 0
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1"
                }`}
              >
                {riderInstructionLines.length > 0 ? (
                  <div className="min-w-0 rounded-md border border-sky-100 bg-white p-3">
                    <span className="mb-2 inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-sky-100">
                      Rider
                    </span>
                    <ul className="list-disc space-y-1 pl-4 text-[12px] text-slate-700">
                      {riderInstructionLines.map((line, i) => (
                        <li key={`rider-${i}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {merchantInstructionLines.length > 0 ? (
                  <div className="min-w-0 rounded-md border border-amber-100 bg-white p-3">
                    <span className="mb-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-100">
                      Merchant
                    </span>
                    <ul className="list-disc space-y-1 pl-4 text-[12px] text-slate-700">
                      {merchantInstructionLines.map((line, i) => (
                        <li key={`mx-${i}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
        </OrderPageOverlay>
    )}

    {toastMessage && (
      <div className="fixed top-4 right-4 z-[10003] max-w-sm rounded-lg bg-slate-800 px-4 py-3 text-sm text-white shadow-lg">
        {toastMessage}
      </div>
    )}
    </>
  );
}


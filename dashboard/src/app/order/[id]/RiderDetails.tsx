"use client";

import { useEffect, useState, type ReactNode } from "react";
import RiderTimeline, { type RiderTimelineData } from "./RiderTimeline";
import { useCancellationReasonCatalog } from "@/hooks/useCancellationReasonCatalog";
import {
  catalogReasonOptionValue,
  findCatalogReasonBySelectValue,
  normalizeCatalogReasonId,
  reasonsForAttribute,
} from "@/lib/orders/orderRejectionOptions";
import type { OrderCustomerFeedback } from "@/lib/orders/order-customer-feedback";
import { formatTipInr, hasRiderFeedback } from "@/lib/orders/order-customer-feedback";
import {
  formatDurationSecondsLabel,
  isSelfPickupDelivery,
} from "@/lib/orders/order-detail-display";
import { useLiveElapsedSeconds } from "@/hooks/useLiveElapsedSeconds";
import { Check, Copy, Star } from "lucide-react";
import { RiderPhotoModal } from "@/components/orders/RiderPhotoModal";
import {
  fetchRiderActivityLogCached,
  getCachedRiderActivityLog,
  prefetchRiderActivityLog,
  type RiderActivityLogApiRow,
  type RiderActivityLogSummary,
} from "@/lib/riderActivityLogCache";
import { useToast } from "@/context/ToastContext";
import { riderDeliveryMilestoneLabel } from "@/lib/riders/rider-order-status-display";

function riderManagementToastMessage(error: string | undefined, fallback: string): string {
  if (!error) return fallback;
  if (
    error === "Rider management service is not configured" ||
    error === "internal_token_not_configured"
  ) {
    return "Could not start rider assignment. Please try again.";
  }
  return error;
}

interface RiderDetailsOrder {
  orderId?: number | null;
  riderId?: number | null;
  riderName?: string | null;
  riderMobile?: string | null;
  riderProvider?: string | null;
  trackingOrderId?: string | null;
  trackingUrl?: string | null;
  deliveryOtp?: string | null;
  status?: string | null;
  currentStatus?: string | null;
  createdAt?: string | null;
  distanceKm?: number | null;
  riderRestaurantWaitSeconds?: number | null;
  riderRestaurantWaitLive?: boolean;
  riderRestaurantWaitAnchorAt?: string | null;
  deliveryType?: string | null;
  orderType?: string | null;
}

interface RiderDetailsProps {
  order: RiderDetailsOrder;
  initialRiderTimeline?: RiderTimelineData | null | undefined;
  riderSelfieUrl?: string | null;
  deliveryProofImageUrl?: string | null;
  customerFeedback?: OrderCustomerFeedback | null;
  tipAmount?: number | null;
  onOpenFeedback?: () => void;
  onCopy: (text: string) => void;
  onPhoneClick?: (title: string, phone: string) => void;
  /** Refetch order after rider cancel / manual assign. */
  onRiderManagementComplete?: (detail: {
    action: "cancel_only" | "cancel_reassign" | "assign_rider";
  }) => void;
  /** Active dispatch waves — hide manual assign while riders are being offered. */
  dispatchSessionActive?: boolean;
  /** Bumps when rider activity log should reload (e.g. new assignment). */
  activityLogRefreshKey?: number;
  className?: string;
}
const EMPTY_RIDER_ACTIVITY_SUMMARY: RiderActivityLogSummary = {
  total: 0,
  cancelled: 0,
  delivered: 0,
  distinctRiders: 0,
};

function formatDistanceKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "";
  const rounded = km % 1 === 0 ? String(km) : km.toFixed(2);
  return `${rounded}km`;
}

const RIDER_LOG_CANCELLED_BY_MARKER = "Cancelled by - ";

/** Split stored reason into denial/reason line and cancelled-by line. */
function parseRiderActivityReason(reason: string): {
  main: string;
  cancelledBy: string | null;
} {
  const trimmed = reason.trim();
  if (!trimmed) return { main: "", cancelledBy: null };

  const dotSep = ` · ${RIDER_LOG_CANCELLED_BY_MARKER}`;
  const dotIdx = trimmed.indexOf(dotSep);
  if (dotIdx >= 0) {
    return {
      main: trimmed.slice(0, dotIdx).trim(),
      cancelledBy: trimmed.slice(dotIdx + dotSep.length).trim() || null,
    };
  }

  const nlIdx = trimmed.indexOf(`\n${RIDER_LOG_CANCELLED_BY_MARKER}`);
  if (nlIdx >= 0) {
    return {
      main: trimmed.slice(0, nlIdx).trim(),
      cancelledBy: trimmed.slice(nlIdx + 1 + RIDER_LOG_CANCELLED_BY_MARKER.length).trim() || null,
    };
  }

  if (trimmed.startsWith(RIDER_LOG_CANCELLED_BY_MARKER)) {
    return {
      main: "",
      cancelledBy: trimmed.slice(RIDER_LOG_CANCELLED_BY_MARKER.length).trim() || null,
    };
  }

  return { main: trimmed, cancelledBy: null };
}

function providerBadgeClass(provider: string): string {
  const upper = provider.toUpperCase();
  if (upper.includes("GATIMITRA")) return "bg-emerald-100 text-emerald-800";
  if (upper.includes("SHIPROCKET")) return "bg-purple-100 text-purple-800";
  if (upper.includes("PIDGE")) return "bg-blue-100 text-blue-800";
  return "bg-gray-100 text-gray-800";
}

function statusBadgeClass(status: string): string {
  if (status === "DELIVERED") return "bg-emerald-100 text-emerald-800";
  if (status === "REACHED MX SKIPPED") return "bg-slate-100 text-slate-700";
  if (status === "PICKED_UP") return "bg-sky-100 text-sky-800";
  if (["CANCELLED", "REJECTED", "UNASSIGNED", "TIMEOUT"].includes(status)) {
    return "bg-red-100 text-red-800";
  }
  return "bg-amber-100 text-amber-800";
}

function shouldShowActivityReason(status: string, reason: string | null | undefined): boolean {
  if (!reason?.trim()) return false;
  if (isCancellationActivityStatus(status)) return true;
  return ["REACHED MX SKIPPED", "PICKED_UP", "REACHED_MERCHANT"].includes(status);
}

function isCancellationActivityStatus(status: string): boolean {
  return ["CANCELLED", "REJECTED", "UNASSIGNED", "TIMEOUT"].includes(status);
}

interface RiderLogModalProps {
  isOpen: boolean;
  orderId: number | null | undefined;
  refreshKey?: number;
  onClose: () => void;
  onCopy: (text: string) => void;
}

function readRiderActivityLogSnapshot(orderId: number | null | undefined) {
  const cached = orderId ? getCachedRiderActivityLog(orderId) : undefined;
  return {
    logs: cached?.logs ?? [],
    summary: cached?.summary ?? EMPTY_RIDER_ACTIVITY_SUMMARY,
  };
}

function RiderLogModal({ isOpen, orderId, refreshKey = 0, onClose, onCopy }: RiderLogModalProps) {
  const [logs, setLogs] = useState<RiderActivityLogApiRow[]>([]);
  const [summary, setSummary] = useState<RiderActivityLogSummary>(EMPTY_RIDER_ACTIVITY_SUMMARY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !orderId) return;

    const cached = readRiderActivityLogSnapshot(orderId);
    setLogs(cached.logs);
    setSummary(cached.summary);
    setError(null);

    let cancelled = false;
    void fetchRiderActivityLogCached(orderId)
      .then((entry) => {
        if (cancelled) return;
        setLogs(entry.logs);
        setSummary(entry.summary);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (cached.logs.length === 0) {
          setLogs([]);
          setSummary(EMPTY_RIDER_ACTIVITY_SUMMARY);
        }
        setError(err instanceof Error ? err.message : "Failed to load rider activity log");
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, orderId, refreshKey]);

  if (!isOpen) return null;

  const cachedEntry = orderId ? getCachedRiderActivityLog(orderId) : undefined;
  const visibleLogs = logs.length > 0 ? logs : (cachedEntry?.logs ?? []);
  const visibleSummary =
    summary.total > 0 ? summary : (cachedEntry?.summary ?? EMPTY_RIDER_ACTIVITY_SUMMARY);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-lg max-w-6xl w-[calc(100vw-2rem)] max-h-[min(90vh,calc(100dvh-2rem))] flex flex-col overflow-hidden text-[12px] text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative z-20 flex shrink-0 items-center justify-between px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-full bg-emerald-100 text-emerald-700">
              <i className="bi bi-person-badge text-[14px]" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Rider Activity Log
              </h2>
              <p className="text-[11px] text-slate-500">
                All rider assignments and status updates for this order
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 max-h-[calc(min(90vh,calc(100dvh-2rem))-12rem)] overflow-y-auto overscroll-contain">
          {error && visibleLogs.length === 0 ? (
            <div className="p-4">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-[12px] text-red-700">
                {error}
              </div>
            </div>
          ) : visibleLogs.length === 0 ? (
            <div className="p-4">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-[12px] text-slate-500">
                No rider activity records for this order yet.
              </div>
            </div>
          ) : (
            <div className="mx-4 my-4 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-max min-w-full table-auto divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      Created at
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      Provider
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      Tracking ID
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      Name
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      Mobile
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      Status
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      Updated By
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      Reason
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      CX Distance
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-r border-gray-200 text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      MX Distance
                    </th>
                    <th className="sticky top-0 z-[15] bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                {visibleLogs.map((log) => {
                  const distanceCx = formatDistanceKm(log.distanceCxKm);
                  const distanceMx = formatDistanceKm(log.distanceMxKm);
                  return (
                  <tr
                    key={log.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      ["CANCELLED", "REJECTED", "UNASSIGNED", "TIMEOUT"].includes(log.status)
                        ? "bg-red-50/40"
                        : log.status === "DELIVERED"
                          ? "bg-emerald-50/40"
                          : log.status === "REACHED MX SKIPPED"
                            ? "bg-slate-50/80"
                            : log.status === "PICKED_UP"
                              ? "bg-sky-50/50"
                              : ""
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      <div className="font-medium">
                        {log.createdAt.split(" ")[0]}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {log.createdAt.split(" ")[1]}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] border-r border-gray-100">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${providerBadgeClass(log.provider)}`}
                      >
                        {log.provider}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] font-mono text-gray-900 border-r border-gray-100">
                      {log.trackingOrderId}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.riderName || (
                        <span className="text-gray-400 italic">Not assigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] border-r border-gray-100">
                      {log.riderMobile ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-900">{log.riderMobile}</span>
                          <button
                            type="button"
                            onClick={() => onCopy(log.riderMobile!)}
                            className="p-1 hover:bg-gray-100 rounded cursor-pointer"
                            title="Copy number"
                          >
                            <i className="bi bi-clipboard text-[10px] text-gray-500" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] border-r border-gray-100">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadgeClass(log.status)}`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.updatedBy}
                    </td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 align-top">
                      {log.reason && shouldShowActivityReason(log.status, log.reason) ? (
                        (() => {
                          const { main, cancelledBy } = parseRiderActivityReason(log.reason);
                          const tone = isCancellationActivityStatus(log.status)
                            ? "text-red-600 font-medium"
                            : "text-slate-700 font-medium";
                          return (
                            <div className={`flex flex-col gap-0.5 max-w-[220px] ${tone}`}>
                              {main ? <span>{main}</span> : null}
                              {cancelledBy ? (
                                <span className="text-[10px] font-normal leading-snug">
                                  {RIDER_LOG_CANCELLED_BY_MARKER}
                                  {cancelledBy}
                                </span>
                              ) : null}
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-slate-900">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {distanceCx || (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {distanceMx || (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px]">
                      {log.trackingUrl ? (
                        <a
                          href={log.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium rounded-md transition-colors"
                        >
                          <i className="bi bi-box-arrow-up-right" />
                          Track
                        </a>
                      ) : (
                        <span className="text-gray-400 italic">No URL</span>
                      )}
                    </td>
                  </tr>
                )})}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!error && visibleLogs.length > 0 ? (
          <div className="relative z-20 shrink-0 border-t border-gray-200 bg-white px-4 py-3">
            <div className="grid grid-cols-1 gap-2 text-[11px] md:grid-cols-3">
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="shrink-0 font-medium text-gray-600">Total Logs</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-base font-bold text-gray-900">{visibleSummary.total}</span>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-gray-600">
                      <i className="bi bi-list-ol text-[12px]" />
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="shrink-0 font-medium text-red-600">Cancelled</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-base font-bold text-red-900">{visibleSummary.cancelled}</span>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-red-100 text-red-600">
                      <i className="bi bi-x-circle text-[12px]" />
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="shrink-0 font-medium text-emerald-600">Delivered</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-base font-bold text-emerald-900">{visibleSummary.delivered}</span>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-emerald-100 text-emerald-600">
                      <i className="bi bi-check-circle text-[12px]" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="relative z-20 flex shrink-0 items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-3 text-[11px] text-gray-500">
          <div>
            <i className="bi bi-info-circle mr-1" />
            Showing {visibleSummary.total} rider activity records
          </div>
          <button
            type="button"
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-md text-[11px] font-medium cursor-pointer"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type CancelActionOption = "" | "CANCEL" | "CANCEL_ASSIGN";

function DetailField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 min-w-0 ${className}`}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-gati-text-secondary">
        {label}
      </span>
      <div className="text-[11px] text-gati-text-primary leading-snug">{children}</div>
    </div>
  );
}

type RiderCopiedField = "mobile" | "trackingId" | "riderId";

function CopyIconButton({
  value,
  fieldKey,
  copiedField,
  onCopied,
  onCopy,
  ariaLabel,
}: {
  value: string;
  fieldKey: RiderCopiedField;
  copiedField: RiderCopiedField | null;
  onCopied: (field: RiderCopiedField) => void;
  onCopy: (text: string) => void;
  ariaLabel: string;
}) {
  const text = value.trim();
  if (!text) return null;

  return (
    <button
      type="button"
      className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity ml-1 shrink-0"
      onClick={() => {
        onCopy(text);
        onCopied(fieldKey);
      }}
      aria-label={ariaLabel}
    >
      {copiedField === fieldKey ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 text-gati-primary" />
      )}
      <span className="sr-only">Copy</span>
    </button>
  );
}

export default function RiderDetails({
  order,
  initialRiderTimeline,
  riderSelfieUrl,
  deliveryProofImageUrl,
  customerFeedback,
  tipAmount,
  onOpenFeedback,
  onCopy,
  onPhoneClick,
  onRiderManagementComplete,
  dispatchSessionActive = false,
  activityLogRefreshKey = 0,
  className = "",
}: RiderDetailsProps) {
  const [showLogModal, setShowLogModal] = useState(false);
  const [selfieImgError, setSelfieImgError] = useState(false);
  const [riderPhotoOpen, setRiderPhotoOpen] = useState(false);
  const [deliveryPhotoOpen, setDeliveryPhotoOpen] = useState(false);
  const [resolvedDeliveryProofUrl, setResolvedDeliveryProofUrl] = useState<string | null>(
    deliveryProofImageUrl?.trim() || null
  );
  const [copiedField, setCopiedField] = useState<RiderCopiedField | null>(null);

  const markCopied = (field: RiderCopiedField) => {
    setCopiedField(field);
    window.setTimeout(() => {
      setCopiedField((prev) => (prev === field ? null : prev));
    }, 1500);
  };

  useEffect(() => {
    setSelfieImgError(false);
  }, [riderSelfieUrl, order.riderId]);

  useEffect(() => {
    if (order.orderId != null) {
      prefetchRiderActivityLog(order.orderId);
    }
  }, [order.orderId, activityLogRefreshKey]);

  const showRiderCancellationEarly = order.orderId != null;
  const {
    attributes: catalogAttributes,
    grouped: catalogGrouped,
    loading: catalogLoading,
  } = useCancellationReasonCatalog({ enabled: showRiderCancellationEarly });
  const [riderAttribute, setRiderAttribute] = useState("");
  const [catalogReasonId, setCatalogReasonId] = useState<number | null>(null);
  const [rejectionOption, setRejectionOption] = useState("");
  const [cancelAction, setCancelAction] = useState<CancelActionOption>("");
  const [managementSubmitting, setManagementSubmitting] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const { toast } = useToast();

  const attributeRejectionOptions = riderAttribute
    ? (catalogGrouped[riderAttribute] ?? [])
    : [];

  const handleAttributeChange = (value: string) => {
    setRiderAttribute(value);
    setCatalogReasonId(null);
    setRejectionOption("");
    setCancelAction("");
  };

  const handleRejectionOptionChange = (value: string) => {
    const row = findCatalogReasonBySelectValue(attributeRejectionOptions, value);
    if (!row) {
      setCatalogReasonId(null);
      setRejectionOption("");
      setCancelAction("");
      return;
    }
    setCatalogReasonId(normalizeCatalogReasonId(row.id));
    setRejectionOption(row.label);
    setCancelAction("");
  };

  const hasAssignedRider =
    order.riderId != null && Number.isFinite(Number(order.riderId)) && Number(order.riderId) > 0;

  const riderName = hasAssignedRider ? order.riderName?.trim() || "—" : "—";
  const riderMobile = hasAssignedRider ? order.riderMobile?.trim() || "—" : "—";
  const rawProvider = order.riderProvider?.trim() || "";
  const riderProvider = hasAssignedRider
    ? !rawProvider || rawProvider === "—"
      ? "—"
      : rawProvider.toLowerCase() === "internal"
        ? "GatiMitra"
        : rawProvider
    : "—";
  const trackingOrderId =
    hasAssignedRider && order.trackingOrderId?.trim() ? order.trackingOrderId.trim() : "—";
  const trackingUrl = hasAssignedRider && order.trackingUrl?.trim() ? order.trackingUrl.trim() : "";
  const isPickupOrderType = isSelfPickupDelivery(order.deliveryType);
  const showPickupHelpMessage = isPickupOrderType && !hasAssignedRider;
  const deliveryOtp = order.deliveryOtp?.trim() || "—";
  const tipLabel = formatTipInr(tipAmount ?? null);
  const showRiderRating = hasRiderFeedback(customerFeedback);

  const orderStatusUpper = String(order.currentStatus ?? order.status ?? "").toUpperCase();
  const isDeliveredOrder = orderStatusUpper === "DELIVERED";
  const serverHasFinalizedWait =
    order.riderRestaurantWaitSeconds != null &&
    Number.isFinite(order.riderRestaurantWaitSeconds);
  const riderWaitLive = Boolean(order.riderRestaurantWaitLive);
  const riderWaitAnchorAt = order.riderRestaurantWaitAnchorAt;
  const liveRiderWaitSeconds = useLiveElapsedSeconds(riderWaitAnchorAt, riderWaitLive);
  const riderWaitDisplaySeconds = riderWaitLive
    ? liveRiderWaitSeconds
    : order.riderRestaurantWaitSeconds;
  const showStoreWaitTime =
    riderWaitLive ||
    (serverHasFinalizedWait && (order.riderRestaurantWaitSeconds ?? 0) > 0);
  const deliveryProofUrl = resolvedDeliveryProofUrl?.trim() || null;

  useEffect(() => {
    setResolvedDeliveryProofUrl(deliveryProofImageUrl?.trim() || null);
  }, [deliveryProofImageUrl]);

  useEffect(() => {
    if (!order.orderId || !isDeliveredOrder) return;

    let cancelled = false;

    void fetch(`/api/orders/${order.orderId}/delivery-proof`, { credentials: "include" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          deliveryProofImageUrl?: string | null;
          hasDeliveryProof?: boolean;
        };
        if (!res.ok || cancelled) return;
        const url = body.deliveryProofImageUrl?.trim() || null;
        setResolvedDeliveryProofUrl(url);
      });

    return () => {
      cancelled = true;
    };
  }, [order.orderId, isDeliveredOrder]);

  const showSelfie =
    hasAssignedRider && Boolean(riderSelfieUrl?.trim()) && !selfieImgError;

  const riderAvatarLetter = hasAssignedRider
    ? riderName !== "—"
      ? riderName.charAt(0).toUpperCase()
      : "R"
    : "R";

  const isTerminalOrder =
    isDeliveredOrder || ["CANCELLED", "FAILED", "REJECTED"].includes(orderStatusUpper);

  const showManualAssign =
    !hasAssignedRider &&
    !isTerminalOrder &&
    order.orderId != null &&
    !dispatchSessionActive;

  const showRiderCancellation = order.orderId != null;
  const riderCancellationDisabled = isTerminalOrder || !hasAssignedRider;
  const isSecondDropdownEnabled = !!riderAttribute && !riderCancellationDisabled;
  const isThirdDropdownEnabled = isSecondDropdownEnabled && !!rejectionOption;
  const isButtonEnabled = isThirdDropdownEnabled && !!cancelAction;

  const selectedCatalogReason =
    catalogReasonId != null
      ? findCatalogReasonBySelectValue(
          attributeRejectionOptions,
          String(catalogReasonId)
        )
      : null;

  const submitRiderManagement = async () => {
    if (riderCancellationDisabled || !isButtonEnabled || !order.orderId || managementSubmitting) {
      return;
    }

    setManagementSubmitting(true);

    const action = cancelAction === "CANCEL_ASSIGN" ? "cancel_reassign" : "cancel_only";

    try {
      const res = await fetch(`/api/orders/${order.orderId}/rider-management`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          riderId: order.riderId,
          catalogReasonId,
          catalogAttribute: riderAttribute,
          reasonCode: selectedCatalogReason?.reasonCode ?? riderAttribute ?? "AGENT_CANCEL",
          reasonText: rejectionOption,
          catalogReasonCode: selectedCatalogReason?.reasonCode ?? null,
          rejectionOption,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        waitingForManualAssignment?: boolean;
        riderPenalty?: {
          applied?: boolean;
          amount?: number;
          ledgerTitle?: string;
          skipped?: string;
        };
      };

      if (!res.ok || !json.success) {
        toast(
          riderManagementToastMessage(
            typeof json.error === "string" ? json.error : undefined,
            "Could not update rider assignment."
          ),
          "error"
        );
        return;
      }

      const penaltyMsg =
        json.riderPenalty?.applied && json.riderPenalty.amount != null
          ? ` Rider penalty ₹${json.riderPenalty.amount.toFixed(2)} applied.`
          : json.riderPenalty?.skipped
            ? ` (Penalty not applied: ${json.riderPenalty.skipped.replace(/_/g, " ")})`
            : "";

      toast(
        (action === "cancel_reassign"
          ? "Rider cancelled and dispatch started for a new rider."
          : "Rider cancelled. Order is waiting for manual assignment.") + penaltyMsg,
        "success"
      );
      setRiderAttribute("");
      setCatalogReasonId(null);
      setRejectionOption("");
      setCancelAction("");
      onRiderManagementComplete?.({
        action: action === "cancel_reassign" ? "cancel_reassign" : "cancel_only",
      });
    } catch {
      toast("Could not update rider assignment. Please try again.", "error");
    } finally {
      setManagementSubmitting(false);
    }
  };

  const submitManualAssign = async () => {
    if (!order.orderId || assignSubmitting) return;

    setAssignSubmitting(true);

    try {
      const res = await fetch(`/api/orders/${order.orderId}/rider-management`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_rider" }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };

      if (!res.ok || !json.success) {
        toast(
          riderManagementToastMessage(
            typeof json.error === "string" ? json.error : undefined,
            "Could not start rider assignment."
          ),
          "error"
        );
        return;
      }

      toast("Assignment offers sent to eligible riders.", "success");
      onRiderManagementComplete?.({ action: "assign_rider" });
    } catch {
      toast("Could not start rider assignment. Please try again.", "error");
    } finally {
      setAssignSubmitting(false);
    }
  };

  return (
    <>
      <div
        className={`bg-white rounded-lg px-3 py-2.5 shadow-sm border border-[#e5e5e5] transition-all hover:shadow-md hover:border-gati-primary/20 flex flex-col ${className}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e5e5e5] pb-2 mb-2">
          <div className="flex min-w-0 items-center gap-2">
            {showSelfie ? (
              <button
                type="button"
                onClick={() => setRiderPhotoOpen(true)}
                className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-sky-100 ring-2 ring-white shadow-sm cursor-zoom-in transition hover:ring-sky-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label={
                  riderName !== "—" ? `View photo of ${riderName}` : "View rider photo"
                }
              >
                <img
                  src={riderSelfieUrl!}
                  alt={riderName !== "—" ? riderName : "Rider"}
                  className="h-full w-full object-cover"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onError={() => setSelfieImgError(true)}
                />
              </button>
            ) : (
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-sky-100 flex items-center justify-center ring-2 ring-white shadow-sm">
                <span className="text-sky-700 text-sm font-semibold">{riderAvatarLetter}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-gati-text-primary leading-tight">
                Rider details
              </p>
              <p className="text-[11px] text-gati-text-secondary flex flex-wrap items-center gap-x-1 leading-snug min-w-0">
                <span className="truncate">
                  {riderName !== "—" ? riderName : "No rider assigned"}
                </span>
                {order.riderId != null && Number.isFinite(Number(order.riderId)) ? (
                  <span className="inline-flex items-center shrink-0 text-slate-400">
                    <span>· #{order.riderId}</span>
                    <CopyIconButton
                      value={String(order.riderId)}
                      fieldKey="riderId"
                      copiedField={copiedField}
                      onCopied={markCopied}
                      onCopy={onCopy}
                      ariaLabel="Copy rider id"
                    />
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          {!showPickupHelpMessage ? (
            <button
              type="button"
              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-full transition-colors cursor-pointer"
              onMouseEnter={() => {
                if (order.orderId != null) prefetchRiderActivityLog(order.orderId);
              }}
              onFocus={() => {
                if (order.orderId != null) prefetchRiderActivityLog(order.orderId);
              }}
              onClick={() => setShowLogModal(true)}
            >
              <i className="bi bi-eye" />
              View Rider&apos;s Log
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5">
          <div
            className={`grid gap-2.5 ${
              order.orderId ? "grid-cols-1 md:grid-cols-[minmax(0,1fr)_12.5rem]" : "grid-cols-1"
            }`}
          >
            {showPickupHelpMessage ? (
              <div className="flex min-h-[140px] items-center justify-center rounded-md border border-slate-100 bg-slate-50/40 px-4">
                <p className="text-center text-[12px] font-semibold text-pink-800 whitespace-nowrap">
                  Customer needs help (Assign rider)
                </p>
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 content-start rounded-md border border-slate-100 bg-slate-50/40 p-2.5">
              <DetailField label="Rider provider">
                <span className="font-semibold">{riderProvider}</span>
              </DetailField>
              <DetailField label="Rider name">
                <span className="font-semibold truncate block">{riderName}</span>
              </DetailField>
              <DetailField label="Mobile number">
                <div className="flex items-center gap-1.5 text-[12px] leading-snug">
                  {order.riderMobile ? (
                    <button
                      type="button"
                      onClick={() => onPhoneClick?.("Rider Phone", order.riderMobile || "")}
                      className="text-gati-primary no-underline font-medium inline-flex items-center gap-0.5 truncate"
                    >
                      <i className="bi bi-telephone text-[11px]" />
                      <span className="truncate">{riderMobile}</span>
                    </button>
                  ) : (
                    <span className="font-semibold">{riderMobile}</span>
                  )}
                  <CopyIconButton
                    value={order.riderMobile || ""}
                    fieldKey="mobile"
                    copiedField={copiedField}
                    onCopied={markCopied}
                    onCopy={onCopy}
                    ariaLabel="Copy rider mobile"
                  />
                </div>
              </DetailField>
              <DetailField label="Tracking order ID">
                <div className="flex items-center gap-1.5 font-semibold leading-snug">
                  <span className="truncate">{trackingOrderId}</span>
                  {trackingOrderId !== "—" ? (
                    <CopyIconButton
                      value={trackingOrderId}
                      fieldKey="trackingId"
                      copiedField={copiedField}
                      onCopied={markCopied}
                      onCopy={onCopy}
                      ariaLabel="Copy tracking order id"
                    />
                  ) : null}
                </div>
              </DetailField>
              <DetailField label="Tracking URL">
                {trackingUrl ? (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-semibold text-emerald-600"
                  >
                    <i className="bi bi-box-arrow-up-right" />
                    Open link
                  </a>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </DetailField>
              <DetailField label="Delivery OTP">
                <div className="flex flex-col gap-1">
                  <span className="inline-flex w-fit px-2 py-0.5 border border-dashed border-emerald-400 bg-emerald-50 rounded font-mono text-emerald-700 font-bold tracking-[0.12em]">
                    {deliveryOtp}
                  </span>
                  {deliveryProofUrl ? (
                    <button
                      type="button"
                      onClick={() => setDeliveryPhotoOpen(true)}
                      className="inline-flex w-fit items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-emerald-700"
                    >
                      <i className="bi bi-image" />
                      View Delivery image
                    </button>
                  ) : null}
                </div>
              </DetailField>
              {showStoreWaitTime ? (
                <DetailField label="Store wait time">
                  <span
                    className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 font-mono font-semibold ${
                      riderWaitLive || (riderWaitDisplaySeconds ?? 0) > 0
                        ? "bg-amber-50 text-amber-900"
                        : "text-slate-700"
                    }`}
                    title="Total time rider waited at store for pickup (reached merchant until order ready)"
                  >
                    {formatDurationSecondsLabel(riderWaitDisplaySeconds, {
                      live: riderWaitLive,
                      onTimeLabel: "0:00:00",
                    })}
                  </span>
                </DetailField>
              ) : null}
              {showRiderRating && customerFeedback?.deliveryRating != null ? (
                <DetailField label="Cx rating">
                  <button
                    type="button"
                    onClick={onOpenFeedback}
                    className="inline-flex items-center gap-1.5 cursor-pointer group font-semibold"
                  >
                    <span>{customerFeedback.deliveryRating}</span>
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" aria-hidden />
                    <span className="text-[10px] text-emerald-700 group-hover:underline">
                      Feedback
                    </span>
                  </button>
                </DetailField>
              ) : null}
              {tipLabel ? (
                <DetailField label="Tip received">
                  <span className="font-bold text-emerald-700">{tipLabel}</span>
                </DetailField>
              ) : null}
            </div>
            )}

            {order.orderId ? (
              <div className="flex w-full max-w-[12.5rem] md:justify-self-end flex-col overflow-visible rounded-md border border-slate-200 bg-white px-2 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Delivery progress
                </p>
                <div className="flex flex-1 flex-col justify-start min-h-0 overflow-y-auto overflow-x-visible pr-0.5">
                  <RiderTimeline
                    className="h-full w-full border-0 shadow-none bg-transparent p-0"
                    orderId={order.orderId}
                    riderId={order.riderId ?? null}
                    orderType={order.orderType}
                    initialData={initialRiderTimeline}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {showRiderCancellation ? (
          <div className="shrink-0 rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div
                className={`flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 ${
                  !hasAssignedRider
                    ? "opacity-50"
                    : riderCancellationDisabled
                      ? "opacity-60"
                      : ""
                }`}
              >
                <i className="bi bi-slash-circle" />
                Rider cancellation
              </div>
              {riderCancellationDisabled ? (
                <span
                  className={`text-[10px] font-semibold ${
                    !hasAssignedRider ? "text-slate-700" : "font-medium text-slate-500"
                  }`}
                >
                  {!hasAssignedRider
                    ? "Assign a rider only if Needed !!"
                    : `Disabled — order ${isDeliveredOrder ? riderDeliveryMilestoneLabel(order.orderType).toLowerCase() : "closed"}`}
                </span>
              ) : (
                <span className="text-[10px] text-slate-500">Cancel rider only · Cancel &amp; reassign</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px]">
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-3 gap-2 ${
                  !hasAssignedRider
                    ? "opacity-50"
                    : riderCancellationDisabled
                      ? "opacity-60"
                      : ""
                }`}
              >
              <select
                className={`h-8 w-full border border-slate-300 rounded px-2 bg-white ${
                  riderCancellationDisabled ? "cursor-not-allowed" : "cursor-pointer"
                }`}
                value={riderAttribute}
                onChange={(e) => handleAttributeChange(e.target.value)}
                disabled={riderCancellationDisabled}
              >
                <option value="">Select Attribute</option>
                {catalogAttributes.map((attr) => (
                  <option key={attr.code} value={attr.code}>
                    {attr.displayLabel || attr.code}
                  </option>
                ))}
              </select>
              <select
                className={`h-8 w-full border border-slate-300 rounded px-2 bg-white ${
                  isSecondDropdownEnabled && !catalogLoading
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-60"
                }`}
                value={catalogReasonId != null ? String(catalogReasonId) : ""}
                onChange={(e) => handleRejectionOptionChange(e.target.value)}
                disabled={
                  riderCancellationDisabled ||
                  !isSecondDropdownEnabled ||
                  (catalogLoading && attributeRejectionOptions.length === 0)
                }
              >
                <option value="">Select Rejection Option</option>
                {attributeRejectionOptions.map((row) => (
                  <option key={catalogReasonOptionValue(row)} value={catalogReasonOptionValue(row)}>
                    {row.label}
                  </option>
                ))}
              </select>
              <select
                className={`h-8 w-full border border-slate-300 rounded px-2 bg-white ${
                  isThirdDropdownEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                }`}
                value={cancelAction}
                onChange={(e) => setCancelAction(e.target.value as CancelActionOption)}
                disabled={riderCancellationDisabled || !isThirdDropdownEnabled}
              >
                <option value="">Select Option</option>
                <option value="CANCEL">Cancel Rider Only</option>
                <option value="CANCEL_ASSIGN">Cancel &amp; Reassign Rider</option>
              </select>
              </div>
              {showManualAssign ? (
                <button
                  type="button"
                  disabled={assignSubmitting}
                  onClick={() => void submitManualAssign()}
                  className={`h-8 w-full sm:w-auto shrink-0 px-4 rounded text-[11px] font-semibold inline-flex items-center justify-center gap-1 ${
                    assignSubmitting
                      ? "cursor-not-allowed bg-emerald-400 text-white"
                      : "cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white"
                  }`}
                >
                  {assignSubmitting ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-person-plus" />
                      Assign Rider manually
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={riderCancellationDisabled || !isButtonEnabled || managementSubmitting}
                  className={`h-8 w-full sm:w-auto shrink-0 px-4 rounded text-[11px] font-semibold inline-flex items-center justify-center gap-1 ${
                    isButtonEnabled
                      ? cancelAction === "CANCEL_ASSIGN"
                        ? "bg-slate-700 hover:bg-slate-800 text-white cursor-pointer"
                        : "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                      : "bg-slate-300 text-slate-500 cursor-not-allowed"
                  }`}
                  onClick={() => void submitRiderManagement()}
                >
                  {managementSubmitting ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent" />
                      Processing...
                    </>
                  ) : cancelAction === "CANCEL_ASSIGN" ? (
                    <>
                      <i className="bi bi-arrow-repeat" />
                      Cancel &amp; Reassign
                    </>
                  ) : (
                    <>
                      <i className="bi bi-x-circle" />
                      Cancel Rider Only
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          ) : null}
        </div>
      </div>

      <RiderLogModal
        isOpen={showLogModal}
        orderId={order.orderId}
        refreshKey={activityLogRefreshKey}
        onClose={() => setShowLogModal(false)}
        onCopy={onCopy}
      />
      <RiderPhotoModal
        open={riderPhotoOpen}
        imageUrl={riderSelfieUrl ?? null}
        riderName={riderName !== "—" ? riderName : null}
        onClose={() => setRiderPhotoOpen(false)}
      />
      <RiderPhotoModal
        open={deliveryPhotoOpen}
        imageUrl={deliveryProofUrl}
        riderName="Delivery proof"
        onClose={() => setDeliveryPhotoOpen(false)}
      />
    </>
  );
}


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
import { Check, Copy, Star } from "lucide-react";
import { RiderPhotoModal } from "@/components/orders/RiderPhotoModal";

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
}

interface RiderDetailsProps {
  order: RiderDetailsOrder;
  initialRiderTimeline?: RiderTimelineData | null | undefined;
  riderSelfieUrl?: string | null;
  customerFeedback?: OrderCustomerFeedback | null;
  tipAmount?: number | null;
  onOpenFeedback?: () => void;
  onCopy: (text: string) => void;
  onPhoneClick?: (title: string, phone: string) => void;
  className?: string;
}
interface RiderLog {
  createdAt: string;
  provider: string;
  trackingId: string;
  name: string;
  mobile: string;
  status: string;
  updatedBy: string;
  reason: string;
  distanceCX: string;
  distanceMX: string;
  url: string;
}

// Sample rider log data for UI only.
const sampleRiderLogs: RiderLog[] = [
  {
    createdAt: "2025-12-03 04:22:15",
    provider: "SHIPROCKET_DIRECT",
    trackingId: "1061706217",
    name: "",
    mobile: "",
    status: "CANCELLED",
    updatedBy: "System",
    reason: "Rider Not Moving",
    distanceCX: "",
    distanceMX: "",
    url: "https://shiprocket.co/tracking/",
  },
  {
    createdAt: "2025-12-03 03:52:49",
    provider: "PIDGE_DIRECT",
    trackingId: "1764713267952VNLl33BZ",
    name: "",
    mobile: "",
    status: "CANCELLED",
    updatedBy: "System",
    reason: "Blacklistesd_Rider",
    distanceCX: "",
    distanceMX: "",
    url: "https://shiprocket.co/tracking/",
  },
  {
    createdAt: "2025-12-04 08:45:00",
    provider: "SHIPROCKET_DIRECT",
    trackingId: "1086718138",
    name: "Ram Yadav",
    mobile: "+917761970466",
    status: "DELIVERED",
    updatedBy: "Rider: Form App",
    reason: "",
    distanceCX: "3.57km",
    distanceMX: "1.39km",
    url: "https://shiprocket.co/tracking/",
  },
];

interface RiderLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (text: string) => void;
}

function RiderLogModal({ isOpen, onClose, onCopy }: RiderLogModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] overflow-auto text-[12px] text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-white">
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

        <div className="p-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Created at
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Provider
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Tracking ID
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Mobile
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Updated By
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Reason
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    CX Distance
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    MX Distance
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sampleRiderLogs.map((log, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-gray-50 transition-colors ${
                      log.status === "CANCELLED"
                        ? "bg-red-50/40"
                        : log.status === "DELIVERED"
                          ? "bg-emerald-50/40"
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
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          log.provider.includes("SHIPROCKET")
                            ? "bg-purple-100 text-purple-800"
                            : log.provider.includes("PIDGE")
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {log.provider}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] font-mono text-gray-900 border-r border-gray-100">
                      {log.trackingId}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.name || (
                        <span className="text-gray-400 italic">Not assigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] border-r border-gray-100">
                      {log.mobile ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-900">{log.mobile}</span>
                          <button
                            type="button"
                            onClick={() => onCopy(log.mobile)}
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
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          log.status === "DELIVERED"
                            ? "bg-emerald-100 text-emerald-800"
                            : log.status === "CANCELLED"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.updatedBy}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] border-r border-gray-100">
                      {log.reason ? (
                        <span className="text-red-600 font-medium">
                          {log.reason}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.distanceCX || (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.distanceMX || (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px]">
                      {log.url ? (
                        <a
                          href={log.url}
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
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-600">Total Logs</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {sampleRiderLogs.length}
                  </p>
                </div>
                <div className="p-2 bg-gray-100 rounded-lg">
                  <i className="bi bi-list-ol text-gray-600 text-base" />
                </div>
              </div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-red-600">Cancelled</p>
                  <p className="text-xl font-bold text-red-900 mt-1">
                    {
                      sampleRiderLogs.filter(
                        (log) => log.status === "CANCELLED"
                      ).length
                    }
                  </p>
                </div>
                <div className="p-2 bg-red-100 rounded-lg">
                  <i className="bi bi-x-circle text-red-600 text-base" />
                </div>
              </div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-emerald-600">Delivered</p>
                  <p className="text-xl font-bold text-emerald-900 mt-1">
                    {
                      sampleRiderLogs.filter(
                        (log) => log.status === "DELIVERED"
                      ).length
                    }
                  </p>
                </div>
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <i className="bi bi-check-circle text-emerald-600 text-base" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 text-[11px] text-gray-500">
          <div>
            <i className="bi bi-info-circle mr-1" />
            Showing {sampleRiderLogs.length} rider activity records
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
  customerFeedback,
  tipAmount,
  onOpenFeedback,
  onCopy,
  onPhoneClick,
  className = "",
}: RiderDetailsProps) {
  const [showLogModal, setShowLogModal] = useState(false);
  const [selfieImgError, setSelfieImgError] = useState(false);
  const [riderPhotoOpen, setRiderPhotoOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<RiderCopiedField | null>(null);

  const markCopied = (field: RiderCopiedField) => {
    setCopiedField(field);
    window.setTimeout(() => {
      setCopiedField((prev) => (prev === field ? null : prev));
    }, 1500);
  };

  useEffect(() => {
    setSelfieImgError(false);
  }, [riderSelfieUrl]);

  const [loadCatalog, setLoadCatalog] = useState(false);
  const {
    attributes: catalogAttributes,
    grouped: catalogGrouped,
    loading: catalogLoading,
  } = useCancellationReasonCatalog({ enabled: loadCatalog });
  const [riderAttribute, setRiderAttribute] = useState("");
  const [catalogReasonId, setCatalogReasonId] = useState<number | null>(null);
  const [rejectionOption, setRejectionOption] = useState("");
  const [cancelAction, setCancelAction] = useState<CancelActionOption>("");

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
    const id = Number(value);
    const row = attributeRejectionOptions.find((r) => r.id === id);
    if (!row) {
      setCatalogReasonId(null);
      setRejectionOption("");
      setCancelAction("");
      return;
    }
    setCatalogReasonId(row.id);
    setRejectionOption(row.label);
    setCancelAction("");
  };

  const isSecondDropdownEnabled = !!riderAttribute;
  const isThirdDropdownEnabled = isSecondDropdownEnabled && !!rejectionOption;
  const isButtonEnabled = isThirdDropdownEnabled && !!cancelAction;

  const riderName = order.riderName || "—";
  const riderMobile = order.riderMobile || "—";
  const rawProvider = order.riderProvider || "—";
  const riderProvider =
    !rawProvider || rawProvider === "internal" ? "GatiMitra" : rawProvider;
  const trackingOrderId = order.trackingOrderId || "—";
  const trackingUrl = order.trackingUrl || "";
  const deliveryOtp = order.deliveryOtp?.trim() || "—";
  const tipLabel = formatTipInr(tipAmount ?? null);
  const showRiderRating = hasRiderFeedback(customerFeedback);
  const showSelfie = Boolean(riderSelfieUrl?.trim()) && !selfieImgError;

  const distanceLabel =
    order.distanceKm != null && Number.isFinite(Number(order.distanceKm))
      ? `${Number(order.distanceKm) % 1 === 0 ? order.distanceKm : Number(order.distanceKm).toFixed(2)} km`
      : null;

  return (
    <>
      <div
        className={`bg-white rounded-lg px-3 py-2.5 shadow-sm border border-[#e5e5e5] transition-all hover:shadow-md hover:border-gati-primary/20 flex flex-col h-full min-h-[300px] ${className}`}
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
                <span className="text-sky-700 text-sm font-semibold">
                  {riderName !== "—" ? riderName.charAt(0).toUpperCase() : "R"}
                </span>
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
          <button
            type="button"
            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-full transition-colors cursor-pointer"
            onClick={() => setShowLogModal(true)}
          >
            <i className="bi bi-eye" />
            View Rider&apos;s Log
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 min-h-0">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_12.5rem] gap-2.5 min-h-0">
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
                  <CopyIconButton
                    value={order.trackingOrderId || ""}
                    fieldKey="trackingId"
                    copiedField={copiedField}
                    onCopied={markCopied}
                    onCopy={onCopy}
                    ariaLabel="Copy tracking order id"
                  />
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
                <span className="inline-flex w-fit px-2 py-0.5 border border-dashed border-emerald-400 bg-emerald-50 rounded font-mono text-emerald-700 font-bold tracking-[0.12em]">
                  {deliveryOtp}
                </span>
              </DetailField>
              {distanceLabel ? (
                <DetailField label="Order distance">
                  <span className="font-semibold">{distanceLabel}</span>
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

            <div className="flex min-h-[140px] w-full max-w-[12.5rem] md:min-h-0 md:justify-self-end flex-col overflow-visible rounded-md border border-slate-200 bg-white px-2 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Delivery progress
              </p>
              <div className="flex flex-1 flex-col justify-start min-h-0 overflow-y-auto overflow-x-visible pr-0.5">
                {order.orderId && order.riderId ? (
                  <RiderTimeline
                    className="h-full w-full border-0 shadow-none bg-transparent p-0"
                    orderId={order.orderId}
                    riderId={order.riderId}
                    initialData={initialRiderTimeline}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-[11px] text-slate-500">
                    Rider not assigned yet
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-800">
              <i className="bi bi-slash-circle" />
              Rider cancellation
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px]">
              <select
                className="h-8 w-full border border-slate-300 rounded px-2 bg-white cursor-pointer"
                value={riderAttribute}
                onFocus={() => setLoadCatalog(true)}
                onChange={(e) => handleAttributeChange(e.target.value)}
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
                disabled={!isThirdDropdownEnabled}
              >
                <option value="">Select Option</option>
                <option value="CANCEL">CANCEL</option>
                <option value="CANCEL_ASSIGN">CANCEL &amp; ASSIGN</option>
              </select>
              <button
                type="button"
                disabled={!isButtonEnabled}
                className={`h-8 w-full sm:w-auto shrink-0 px-4 rounded text-[11px] font-semibold inline-flex items-center justify-center gap-1 ${
                  isButtonEnabled
                    ? cancelAction === "CANCEL_ASSIGN"
                      ? "bg-slate-700 hover:bg-slate-800 text-white cursor-pointer"
                      : "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                    : "bg-slate-300 text-slate-500 cursor-not-allowed"
                }`}
                onClick={() => {
                  if (!isButtonEnabled) return;
                  // eslint-disable-next-line no-alert
                  alert("Rider cancellation flow will be implemented soon.");
                }}
              >
                {cancelAction === "CANCEL_ASSIGN" ? (
                  <>
                    <i className="bi bi-arrow-repeat" />
                    Cancel &amp; Assign
                  </>
                ) : (
                  <>
                    <i className="bi bi-x-circle" />
                    Cancel
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <RiderLogModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        onCopy={onCopy}
      />
      <RiderPhotoModal
        open={riderPhotoOpen}
        imageUrl={riderSelfieUrl ?? null}
        riderName={riderName !== "—" ? riderName : null}
        onClose={() => setRiderPhotoOpen(false)}
      />
    </>
  );
}


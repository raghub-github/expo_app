"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, History, RefreshCw, X } from "lucide-react";
import type { PersonRideDetailOrder } from "./person-ride-detail-types";
import { formatRideStatusLabel, normalizeStatus } from "./person-ride-utils";
import { titleCaseStatusWords } from "@/lib/riders/rider-order-status-display";
import { formatOrderHeaderDateTime } from "@/lib/orders/order-detail-display";
import { OrderPageOverlay } from "@/components/orders/OrderPageOverlay";
import { OrderNum } from "@/components/orders/orders-typography";
import {
  canApplyManualStatusUpdate,
  isManualStatusOptionDisabled,
  resolveDispatchManualStage,
  type ManualStatusValue,
} from "@/lib/orders/order-dispatch-status";

export type PersonRideTicketSummary = {
  id: number;
  ticketNumber: string;
  status: string | null;
};

export type PersonRideStatusHistoryEntry = {
  toStatus: string;
  updatedByEmail: string;
  updatedByRole: string;
  createdAt: string;
};

/** Ride-facing labels for the shared manual status API values. */
const RIDE_STATUS_LABELS: Record<ManualStatusValue, string> = {
  picked_up: "Trip started",
  in_transit: "In transit",
  delivered: "Mark complete",
};

const STATUS_OPTIONS = [
  { value: "picked_up" as const, label: RIDE_STATUS_LABELS.picked_up },
  { value: "in_transit" as const, label: RIDE_STATUS_LABELS.in_transit },
  { value: "delivered" as const, label: RIDE_STATUS_LABELS.delivered },
] as const;

function parseManualStatusValue(raw: string | null | undefined): ManualStatusValue | null {
  const v = (raw ?? "").toString().toLowerCase().trim();
  if (v === "picked_up" || v === "in_transit" || v === "delivered") return v;
  return null;
}

function statusChipClasses(status: string): string {
  const key = normalizeStatus(status);
  if (key === "delivered") return "bg-emerald-100 border-emerald-300 text-emerald-900";
  if (key === "cancelled") return "bg-sky-200 border-sky-300 text-sky-900";
  if (key === "failed") return "bg-red-50 border-red-200 text-red-800";
  if (["in_transit", "picked_up"].includes(key))
    return "bg-amber-50 border-amber-200 text-amber-800";
  if (["assigned", "accepted", "reached_store"].includes(key))
    return "bg-sky-50 border-sky-200 text-sky-800";
  return "bg-slate-100 border-slate-200 text-slate-700";
}

function AgentRoleBadge({ role }: { role: string | null | undefined }) {
  const label = role?.trim() || "AGENT";
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-700 whitespace-nowrap">
      {label}
    </span>
  );
}

export default function PersonRideOrderHeader({
  order,
  tickets,
  refreshing,
  onRefresh,
  routedToLabel,
  statusHistory,
  onStatusHistoryChange,
  loggedInEmail,
  onManualStatusApplied,
}: {
  order: PersonRideDetailOrder;
  tickets: PersonRideTicketSummary[];
  refreshing: boolean;
  onRefresh: () => void;
  /** Display name (preferred) or email for Routed To */
  routedToLabel?: string | null;
  statusHistory: PersonRideStatusHistoryEntry[];
  onStatusHistoryChange: (next: PersonRideStatusHistoryEntry[]) => void;
  loggedInEmail: string | null;
  onManualStatusApplied?: (status: ManualStatusValue) => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ManualStatusValue | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);

  const displayId =
    order.formattedOrderId?.trim() ||
    order.orderId?.trim() ||
    `GMP${String(order.id).padStart(6, "0")}`;
  const normalizedId = displayId.replace(/^#/, "");

  const statusRaw = order.currentStatus ?? order.status;
  const statusLabel = formatRideStatusLabel(statusRaw);
  const createdLabel = formatOrderHeaderDateTime(order.createdAt);

  const dispatchStage = useMemo(
    () =>
      resolveDispatchManualStage({
        status: order.status,
        currentStatus: order.currentStatus,
      }),
    [order.status, order.currentStatus]
  );

  const lastStatusUpdaterEmail = order.manualStatusUpdatedByEmail?.trim() || null;
  const hasManualStatusUpdate =
    Boolean(lastStatusUpdaterEmail) || statusHistory.length > 0;

  const lastManualStatusValue = useMemo((): ManualStatusValue | null => {
    if (!hasManualStatusUpdate) return null;
    const fromHistory = parseManualStatusValue(statusHistory[0]?.toStatus);
    if (fromHistory) return fromHistory;
    return parseManualStatusValue(order.status);
  }, [hasManualStatusUpdate, statusHistory, order.status]);

  const statusButtonLabel = lastManualStatusValue
    ? RIDE_STATUS_LABELS[lastManualStatusValue]
    : "Select Option";
  const isOrderCancelledOrRejected = dispatchStage === "cancelled";
  const isOptionDisabled = (value: ManualStatusValue) =>
    isManualStatusOptionDisabled(dispatchStage, value);
  const isUpdateStatusButtonDisabled =
    selectedStatus == null ||
    dispatchStage === "delivered" ||
    dispatchStage === "cancelled" ||
    !canApplyManualStatusUpdate(dispatchStage, selectedStatus);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const handleCopyId = () => {
    if (!normalizedId || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(normalizedId).then(() => {
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => {
        setCopied(false);
        copyResetRef.current = null;
      }, 2500);
    });
  };

  const openStatusModal = useCallback(() => {
    if (dispatchStage === "cancelled" || dispatchStage === "delivered") return;
    setStatusUpdateError(null);
    setSelectedStatus(null);
    setShowStatusModal(true);
  }, [dispatchStage]);

  const submitStatusUpdate = useCallback(async () => {
    if (!order?.id || isUpdatingStatus || selectedStatus == null) return;
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
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || data.success === false) {
        setStatusUpdateError(
          data.error || "Failed to update status. Please try again."
        );
        return;
      }
      setShowStatusModal(false);
      onStatusHistoryChange([
        {
          toStatus: selectedStatus,
          updatedByEmail: loggedInEmail || "unknown",
          updatedByRole: "AGENT",
          createdAt: new Date().toISOString(),
        },
        ...statusHistory,
      ]);
      await onManualStatusApplied?.(selectedStatus);
    } catch {
      setStatusUpdateError("Failed to update status. Please try again.");
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [
    order?.id,
    isUpdatingStatus,
    dispatchStage,
    selectedStatus,
    loggedInEmail,
    statusHistory,
    onStatusHistoryChange,
    onManualStatusApplied,
  ]);

  return (
    <>
      <section className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-slate-100 pb-3">
        <div className="flex flex-col items-start gap-0.5">
          <h1 className="m-0 flex items-center gap-2">
            <span className="pr-num inline-flex items-center rounded-md border-0 bg-emerald-50/15 px-0 py-0.5 text-[16px] font-extrabold tracking-wide text-emerald-800">
              #{normalizedId || "—"}
            </span>
            <button
              type="button"
              onClick={handleCopyId}
              className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-slate-500 transition hover:text-slate-700"
              aria-label={copied ? "Copied" : "Copy order ID"}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-gati-primary" />
              )}
            </button>
          </h1>
          <p className="pr-num mt-1 pl-0 text-[12px] font-bold text-slate-800">
            {createdLabel}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-[11px]">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {routedToLabel?.trim() ? (
              <p className="pr-body text-[11px] text-slate-500">
                Routed To:{" "}
                <span className="font-medium text-slate-800">{routedToLabel.trim()}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              title="Refresh order details"
              aria-label="Refresh order details"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            </button>
          </div>
        </div>
      </section>

      <section className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-slate-600">
        <div className="flex min-w-[260px] flex-1 flex-wrap items-center gap-2.5">
          {tickets.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowTicketsModal(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <span className="font-mono">{tickets[0].ticketNumber}</span>
                <span className="text-emerald-600/80">·</span>
                <span>
                  {tickets[0].status
                    ? titleCaseStatusWords(tickets[0].status)
                    : "—"}
                </span>
              </span>
              {tickets.length > 1 ? (
                <span className="text-[10px] text-slate-500">+{tickets.length - 1} more</span>
              ) : null}
              <span className="ml-0.5 text-[10px] text-slate-500">▾</span>
            </button>
          ) : null}
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-normal ${statusChipClasses(
              statusRaw
            )}`}
          >
            Order status:&nbsp;
            <span className="font-medium">{statusLabel}</span>
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-normal text-slate-700">
            Order category:&nbsp;
            <span className="font-medium">Person ride</span>
          </span>
        </div>

        <div className="relative ml-auto flex items-center gap-2">
          {!hasManualStatusUpdate ? (
            <span className="text-[11px] text-slate-500">Update order status</span>
          ) : (
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-gati-text-primary"
              title="View status history"
            >
              <span className="max-w-[200px] truncate">
                {lastStatusUpdaterEmail ||
                  statusHistory[0]?.updatedByEmail ||
                  "Status history"}
              </span>
              <span className="ml-1 shrink-0 text-[10px] text-slate-500">▾</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => !isOrderCancelledOrRejected && openStatusModal()}
            disabled={isOrderCancelledOrRejected || dispatchStage === "delivered"}
            className="inline-flex h-6 min-h-0 items-center gap-1 rounded border border-slate-200 bg-white pl-2 pr-1.5 text-[11px] leading-tight text-slate-700 shadow-sm transition focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
            title={
              isOrderCancelledOrRejected
                ? "Order is cancelled"
                : dispatchStage === "delivered"
                  ? "Ride already completed"
                  : "Update order status"
            }
          >
            {statusButtonLabel}
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          </button>
          {showStatusModal ? (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/20"
                aria-hidden
                onClick={() => setShowStatusModal(false)}
              />
              <div
                className="absolute right-0 top-full z-50 mt-1 w-max min-w-[11rem] max-w-[14rem] rounded-md border border-slate-200 bg-white px-1.5 py-1.5 shadow-lg"
                role="dialog"
                aria-label="Update order status"
              >
                <p className="px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  Update order status
                </p>
                <div className="space-y-0">
                  {STATUS_OPTIONS.map((opt) => {
                    const disabled = isOptionDisabled(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2 rounded px-2 py-1 ${
                          disabled
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="personRideOrderStatus"
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
                {selectedStatus == null ? (
                  <p className="mt-1 px-2 text-[10px] text-slate-500">
                    Select an option above, then update.
                  </p>
                ) : null}
                {statusUpdateError ? (
                  <p className="mt-1 px-2 text-[10px] text-red-600" role="alert">
                    {statusUpdateError}
                  </p>
                ) : null}
                <div className="mt-1 border-t border-slate-100 px-1 pt-1.5">
                  <button
                    type="button"
                    onClick={() => void submitStatusUpdate()}
                    disabled={isUpdatingStatus || isUpdateStatusButtonDisabled}
                    className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-md bg-emerald-500 px-2 py-1.5 text-[11px] font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
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
          ) : null}
        </div>
      </section>

      {showTicketsModal && tickets.length > 0 ? (
        <OrderPageOverlay
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onBackdropClick={(e) => {
            if (e.target === e.currentTarget) setShowTicketsModal(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-4 text-[12px] text-slate-800 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-xs font-semibold text-slate-900">Linked tickets</h2>
              <button
                type="button"
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowTicketsModal(false)}
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="space-y-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <a
                    href={`/dashboard/tickets/${t.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 hover:bg-slate-50"
                  >
                    <span className="font-mono text-[11px] font-semibold text-emerald-700">
                      {t.ticketNumber}
                    </span>
                    <span className="text-[11px] text-slate-600">
                      {t.status ? titleCaseStatusWords(t.status) : "—"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </OrderPageOverlay>
      ) : null}

      {showHistoryModal ? (
        <OrderPageOverlay
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onBackdropClick={(e) => {
            if (e.target === e.currentTarget) setShowHistoryModal(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-4 text-[12px] text-slate-800 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-emerald-500" />
                <h2 className="text-xs font-semibold text-slate-900">Order status history</h2>
              </div>
              <button
                type="button"
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowHistoryModal(false)}
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {statusHistory.length === 0 ? (
              <p className="py-4 text-[11px] text-slate-500">No manual status updates yet.</p>
            ) : (
              <div className="max-h-[50vh] overflow-x-auto overflow-y-auto">
                <table className="w-full border-collapse text-left text-[11px]">
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
                          {RIDE_STATUS_LABELS[entry.toStatus as ManualStatusValue] ??
                            entry.toStatus.replace(/_/g, " ")}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-slate-600">
                          <OrderNum>{new Date(entry.createdAt).toLocaleString()}</OrderNum>
                        </td>
                        <td className="py-2 pr-3">
                          <AgentRoleBadge role={entry.updatedByRole} />
                        </td>
                        <td
                          className="max-w-[180px] truncate py-2 text-slate-600"
                          title={entry.updatedByEmail}
                        >
                          {entry.updatedByEmail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </OrderPageOverlay>
      ) : null}
    </>
  );
}

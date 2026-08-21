"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Loader2, RotateCcw, X } from "lucide-react";
import { OrderPageOverlay } from "@/components/orders/OrderPageOverlay";
import { useCancellationReasonCatalog } from "@/hooks/useCancellationReasonCatalog";
import {
  normalizeCatalogReasonId,
  reasonsForAttribute,
} from "@/lib/orders/orderRejectionOptions";

type RefundType =
  | ""
  | "cancel_without_refund"
  | "refund_with_cancellation"
  | "refund_without_cancellation";

type FaultOption = "" | "customer_fault" | "3pl_fault" | "platform_fault";

type RideAttribute = "" | "CUSTOMER" | "RIDER" | "OTHER";

const MIN_GATEWAY_REFUND = 1;

/** Person-ride only — hardcoded reasons (not merchant catalog). */
const PERSON_RIDE_HARDCODED_REASONS: Record<"CUSTOMER" | "RIDER", string[]> = {
  CUSTOMER: [
    "Customer cancelled the ride",
    "Wrong pickup or drop location",
    "Customer not responding / unreachable",
    "Customer refused to board",
    "Fare / payment dispute by customer",
  ],
  RIDER: [
    "Rider cancelled after accept",
    "Rider delayed / did not arrive",
    "Rider unresponsive",
    "Wrong vehicle or rider mismatch",
    "Rider denied the trip",
  ],
};

const ATTRIBUTE_OPTIONS: { code: RideAttribute; label: string }[] = [
  { code: "CUSTOMER", label: "Customer" },
  { code: "RIDER", label: "Rider" },
  { code: "OTHER", label: "Others" },
];

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export default function PersonRideRefundModal({
  isOpen,
  onClose,
  orderId,
  payableTotal,
  remainingRefundable,
  orderAlreadyCancelled,
  refundActionsDisabled,
  onRefundCreated,
  onRoutedTo,
  onToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  payableTotal: number;
  remainingRefundable: number;
  orderAlreadyCancelled?: boolean;
  refundActionsDisabled?: boolean;
  onRefundCreated?: () => void;
  onRoutedTo?: (info: { email: string | null; name: string | null }) => void;
  onToast?: (message: string, tone?: "success" | "error") => void;
}) {
  /** Catalog is only used to resolve a valid catalogReasonId for the API. */
  const { grouped, loading: catalogLoading } = useCancellationReasonCatalog({
    enabled: isOpen,
  });

  const [attribute, setAttribute] = useState<RideAttribute>("");
  const [presetReason, setPresetReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [refundType, setRefundType] = useState<RefundType>("");
  const [fault, setFault] = useState<FaultOption>("");
  const [customAmount, setCustomAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAttribute("");
    setPresetReason("");
    setOtherReason("");
    setRefundType("");
    setFault("");
    setCustomAmount("");
    setSubmitting(false);
  }, [isOpen, orderId]);

  const maxRefundable = Math.max(
    0,
    Number.isFinite(remainingRefundable) ? remainingRefundable : payableTotal
  );

  const resolvedAmount = useMemo(() => {
    if (refundType === "cancel_without_refund") return 0;
    if (refundType === "refund_with_cancellation") {
      return round2(Math.min(Math.max(payableTotal, 0), maxRefundable || payableTotal));
    }
    const n = Number(customAmount);
    return Number.isFinite(n) ? round2(n) : 0;
  }, [refundType, payableTotal, maxRefundable, customAmount]);

  const resolvedReasonText = useMemo(() => {
    if (attribute === "OTHER") return otherReason.trim();
    if (attribute === "CUSTOMER" || attribute === "RIDER") return presetReason.trim();
    return "";
  }, [attribute, otherReason, presetReason]);

  /** Pick any active catalog row for the attribute so refund API accepts the request. */
  const catalogReasonIdForAttribute = (attr: string): number | null => {
    const rows = reasonsForAttribute(grouped, attr);
    const exact = rows.find((r) => r.label.trim() === resolvedReasonText);
    if (exact) return normalizeCatalogReasonId(exact.id);
    return normalizeCatalogReasonId(rows[0]?.id);
  };

  if (!isOpen) return null;

  const handleAttributeChange = (value: string) => {
    setAttribute(value as RideAttribute);
    setPresetReason("");
    setOtherReason("");
  };

  const handleSubmit = async () => {
    if (refundActionsDisabled) {
      onToast?.("Refund actions are locked for this order.", "error");
      return;
    }
    if (!attribute || !refundType) {
      onToast?.("Please select attribute and refund action.", "error");
      return;
    }
    if (!resolvedReasonText) {
      onToast?.(
        attribute === "OTHER"
          ? "Please write a reason for Others."
          : "Please select a reason.",
        "error"
      );
      return;
    }
    if (refundType === "refund_with_cancellation" && orderAlreadyCancelled) {
      onToast?.("Order is already cancelled. Use amount refund instead.", "error");
      return;
    }
    if (refundType !== "cancel_without_refund" && !fault) {
      onToast?.("Please select fault.", "error");
      return;
    }
    if (refundType !== "cancel_without_refund") {
      if (!(resolvedAmount > 0)) {
        onToast?.("Refund amount must be greater than 0.", "error");
        return;
      }
      if (resolvedAmount + 0.001 < MIN_GATEWAY_REFUND) {
        onToast?.(`Refund must be at least ₹${MIN_GATEWAY_REFUND}.`, "error");
        return;
      }
      if (maxRefundable > 0 && resolvedAmount > maxRefundable + 0.01) {
        onToast?.(
          `Refund cannot exceed remaining ₹${maxRefundable.toFixed(2)}.`,
          "error"
        );
        return;
      }
    }

    const catalogReasonId = catalogReasonIdForAttribute(attribute);
    if (catalogReasonId == null) {
      onToast?.(
        "Cancellation catalog is missing for this attribute. Ask admin to enable Customer/Rider/Other reasons.",
        "error"
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/refunds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refundType,
          refundReason: `${attribute} - ${resolvedReasonText}`,
          refundDescription: `Person ride refund. Fault: ${fault || "n/a"}. Reason: ${resolvedReasonText}`,
          refundAmount: resolvedAmount,
          mxDebitAmount: 0,
          mxDebitReason: "no_debit",
          attribute,
          rejection: resolvedReasonText,
          catalogReasonId,
          fault: fault || undefined,
          merchantDebit: "no_debit",
          refundMetadata: {
            personRide: true,
            rideAttribute: attribute,
            rideReason: resolvedReasonText,
            reasonSource: attribute === "OTHER" ? "free_text" : "hardcoded",
            ...(refundType === "refund_without_cancellation"
              ? { amountOnly: true, customerRefundAmount: resolvedAmount }
              : {}),
            ...(refundType === "refund_with_cancellation"
              ? {
                  ctcTotal: payableTotal,
                  customerRefundAmount: resolvedAmount,
                  fullOrderAmount: payableTotal,
                }
              : {}),
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        routedToEmail?: string | null;
        routedToName?: string | null;
      };
      if (!res.ok || data.success === false) {
        onToast?.(data.error ?? "Failed to create refund", "error");
        return;
      }
      onToast?.(
        refundType === "cancel_without_refund"
          ? "Ride cancelled without refund."
          : "Refund created.",
        "success"
      );
      onRoutedTo?.({
        email: data.routedToEmail ?? null,
        name: data.routedToName ?? null,
      });
      onRefundCreated?.();
      onClose();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "Failed to submit refund", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const radioChip = (selected: boolean, disabled?: boolean) =>
    `flex items-center gap-1.5 border px-2 py-1.5 rounded bg-white min-w-[140px] text-[11px] ${
      disabled
        ? "opacity-50 cursor-not-allowed border-slate-200 bg-slate-50"
        : `cursor-pointer hover:bg-emerald-50 ${
            selected ? "border-emerald-500 bg-emerald-50" : "border-slate-200"
          }`
    }`;

  return (
    <OrderPageOverlay
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-5"
      onBackdropClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-[min(720px,96vw)] flex-col overflow-hidden rounded-lg bg-white shadow-[0_20px_40px_rgba(0,0,0,0.2)] animate-[fadeIn_0.3s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-lg border-b border-slate-200 bg-emerald-50 px-4 py-2.5">
          <h3 className="m-0 flex items-center gap-2 text-base font-semibold text-slate-800">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-600"
              aria-hidden
            >
              <RotateCcw className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="truncate">Person ride refund</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-1 text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-700">Payable total</p>
                <p className="pr-num mt-1 text-lg font-bold tabular-nums text-emerald-600">
                  ₹{round2(Math.max(payableTotal, 0)).toFixed(2)}
                </p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                <span className="font-medium text-slate-700">Remaining refundable: </span>
                <span className="font-bold tabular-nums text-emerald-700">
                  ₹{round2(maxRefundable).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <RotateCcw className="h-4 w-4 shrink-0 text-emerald-600" /> Create refund
          </h4>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="whitespace-nowrap text-xs font-medium text-slate-600">
              Refund reason
            </label>
            <select
              value={attribute}
              onChange={(e) => handleAttributeChange(e.target.value)}
              className="h-8 min-w-[140px] cursor-pointer rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Select Attribute</option>
              {ATTRIBUTE_OPTIONS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label}
                </option>
              ))}
            </select>

            {attribute === "CUSTOMER" || attribute === "RIDER" ? (
              <select
                value={presetReason}
                onChange={(e) => setPresetReason(e.target.value)}
                disabled={!attribute}
                className={`h-8 min-w-[160px] rounded border bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  attribute
                    ? "cursor-pointer border-emerald-500 text-slate-800"
                    : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                }`}
              >
                <option value="">Rejection option</option>
                {PERSON_RIDE_HARDCODED_REASONS[attribute].map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            ) : null}

            {catalogLoading ? (
              <span className="text-[11px] text-slate-400">Loading catalog…</span>
            ) : null}
          </div>

          {attribute === "OTHER" ? (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-slate-700">Write reason</label>
              <textarea
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                rows={3}
                placeholder="Describe the reason…"
                className="w-full rounded border border-slate-200 px-2.5 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          ) : null}

          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Refund type</label>
            <div className="flex flex-wrap gap-2">
              <label
                className={radioChip(
                  refundType === "cancel_without_refund",
                  orderAlreadyCancelled
                )}
                title={orderAlreadyCancelled ? "Order is already cancelled" : undefined}
              >
                <input
                  type="radio"
                  name="ride-refund-type"
                  checked={refundType === "cancel_without_refund"}
                  disabled={orderAlreadyCancelled}
                  onChange={() => setRefundType("cancel_without_refund")}
                  className="h-3 w-3 cursor-pointer text-emerald-600 disabled:cursor-not-allowed"
                />
                Cancel without refund
              </label>
              <label
                className={radioChip(
                  refundType === "refund_with_cancellation",
                  orderAlreadyCancelled
                )}
                title={
                  orderAlreadyCancelled
                    ? "Order is already cancelled on the progress timeline"
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="ride-refund-type"
                  checked={refundType === "refund_with_cancellation"}
                  disabled={orderAlreadyCancelled}
                  onChange={() => setRefundType("refund_with_cancellation")}
                  className="h-3 w-3 cursor-pointer text-emerald-600 disabled:cursor-not-allowed"
                />
                Refund with cancellation
              </label>
              <label
                className={radioChip(
                  refundType === "refund_without_cancellation",
                  refundActionsDisabled
                )}
                title={refundActionsDisabled ? "Refund actions are locked" : undefined}
              >
                <input
                  type="radio"
                  name="ride-refund-type"
                  checked={refundType === "refund_without_cancellation"}
                  disabled={refundActionsDisabled}
                  onChange={() => setRefundType("refund_without_cancellation")}
                  className="h-3 w-3 cursor-pointer text-emerald-600 disabled:cursor-not-allowed"
                />
                Refund without cancellation
              </label>
            </div>
          </div>

          {refundType === "refund_without_cancellation" ? (
            <div className="mb-3 rounded-md border border-slate-200 bg-white p-3">
              <h5 className="mb-2 text-xs font-medium text-slate-700">Refund amount</h5>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={MIN_GATEWAY_REFUND}
                  step="0.01"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="h-8 w-full max-w-[200px] rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder={`Max ₹${round2(maxRefundable).toFixed(2)}`}
                />
                <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs">
                  <span className="font-medium text-slate-700">Customer refund: </span>
                  <span className="font-bold text-emerald-700">
                    ₹{resolvedAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {refundType === "refund_with_cancellation" ? (
            <div className="mb-3 flex justify-end">
              <div className="w-full max-w-[300px] rounded-md border border-emerald-200 bg-emerald-50/80 p-3">
                <p className="text-[11px] font-semibold text-slate-700">Customer refund preview</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">
                  ₹{resolvedAmount.toFixed(2)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Full payable total (cancel + refund)
                </p>
              </div>
            </div>
          ) : null}

          {refundType && refundType !== "cancel_without_refund" ? (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-slate-700">Fault</label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "customer_fault", label: "Customer" },
                    { value: "3pl_fault", label: "3PL" },
                    { value: "platform_fault", label: "Platform" },
                  ] as const
                ).map((f) => (
                  <label
                    key={f.value}
                    className={`flex cursor-pointer items-center gap-1.5 rounded border bg-white px-2 py-1.5 text-[11px] hover:bg-emerald-50 ${
                      fault === f.value
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="ride-fault"
                      value={f.value}
                      checked={fault === f.value}
                      onChange={() => setFault(f.value)}
                      className="h-3 w-3 cursor-pointer text-emerald-600"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {refundActionsDisabled ? (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Refund actions are locked for this order.
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex cursor-pointer items-center gap-1.5 rounded border-none bg-gray-200 px-4 py-2 text-xs font-medium text-gray-800 hover:bg-gray-300"
            >
              <X className="h-4 w-4" /> Close
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || refundActionsDisabled}
              className={`flex items-center gap-1.5 rounded border-none px-4 py-2 text-xs font-semibold text-white ${
                submitting || refundActionsDisabled
                  ? "cursor-not-allowed bg-slate-300"
                  : "cursor-pointer bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Submit Refund
            </button>
          </div>
        </div>
      </div>
      </OrderPageOverlay>
    );
}

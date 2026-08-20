"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { RideTimelineCard, type TimelineStamp } from "./PersonRideDetailSections";
import type { PersonRideDetailOrder } from "./person-ride-detail-types";
import { isRideFarePaymentPending } from "@/lib/riders/ride-wallet-credit-pending";
import { titleCaseStatusWords } from "@/lib/riders/rider-order-status-display";

type RemarkRow = {
  id: string;
  type: string;
  content: string;
  time: string;
};

type RemarkCategory = "CUSTOMER" | "RIDER" | "OTHER";

export default function PersonRideRightSidebar({
  order,
  stamps,
  onClearHold,
  clearingHold,
  holdCleared,
  onCreateRefund,
  refundDisabled,
  refundDisabledReason,
  refunds,
  paymentStatus,
  onRoutedTo,
}: {
  order: PersonRideDetailOrder;
  stamps: TimelineStamp[];
  onClearHold?: () => void;
  clearingHold?: boolean;
  holdCleared?: boolean;
  onCreateRefund?: () => void;
  refundDisabled?: boolean;
  refundDisabledReason?: string;
  refunds?: Array<{
    id: number;
    refundAmount: string;
    refundStatus: string | null;
    refundType?: string | null;
    refundReason?: string | null;
    executionStatus?: string | null;
    createdAt?: string | Date | null;
    initiatedByEmail?: string | null;
  }>;
  /** Live DB payment status (prefer payment-detail over cached order). */
  paymentStatus?: string | null;
  /** Fired when remark stamps Routed To (name preferred). */
  onRoutedTo?: (info: { email: string | null; name: string | null }) => void;
}) {
  const { toast } = useToast();
  const [remarks, setRemarks] = useState<RemarkRow[]>([]);
  const [remarkType, setRemarkType] = useState<RemarkCategory>("CUSTOMER");
  const [remarkText, setRemarkText] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);
  const [loadingRemarks, setLoadingRemarks] = useState(false);

  const statusUpper = String(order.currentStatus ?? order.status ?? "")
    .trim()
    .toUpperCase();
  const payStatus = paymentStatus ?? order.paymentStatus;
  const farePending = isRideFarePaymentPending(payStatus);
  const adminCleared =
    Boolean(order.rideDetail?.adminRiderPaymentClearedAt?.trim()) || Boolean(holdCleared);
  const canClearRiderHold =
    Boolean(onClearHold) &&
    statusUpper === "DELIVERED" &&
    farePending &&
    order.riderId != null &&
    order.riderId > 0 &&
    !adminCleared;

  const loadRemarks = useCallback(async () => {
    setLoadingRemarks(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks`, { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: Array<{
          id: number;
          remark: string;
          remarkCategory?: string | null;
          createdAt?: string | Date;
        }>;
      } | null;
      if (!json?.success || !Array.isArray(json.data)) return;
      setRemarks(
        json.data.map((r) => {
          const created = r.createdAt ? new Date(r.createdAt) : null;
          return {
            id: String(r.id),
            type: r.remarkCategory ?? "OTHER",
            content: r.remark,
            time:
              created && !Number.isNaN(created.getTime())
                ? created.toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })
                : "—",
          };
        })
      );
    } finally {
      setLoadingRemarks(false);
    }
  }, [order.id]);

  useEffect(() => {
    void loadRemarks();
  }, [loadRemarks]);

  const addRemark = async () => {
    const text = remarkText.trim();
    if (!text || savingRemark) return;

    setSavingRemark(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remark: text,
          remarkCategory: remarkType,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        routedToEmail?: string | null;
        routedToName?: string | null;
      } | null;
      if (!res.ok || json?.success === false) {
        toast(json?.error ?? "Failed to save remark.", "error");
        return;
      }
      setRemarkText("");
      toast("Remark added.", "success");
      onRoutedTo?.({
        email: json?.routedToEmail ?? null,
        name: json?.routedToName ?? null,
      });
      void loadRemarks();
    } catch {
      toast("Failed to save remark.", "error");
    } finally {
      setSavingRemark(false);
    }
  };

  return (
    <div className="space-y-3">
      <RideTimelineCard order={order} stamps={stamps} compact />

      {canClearRiderHold ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-sm">
          <p className="text-[11px] leading-relaxed font-medium text-amber-900">
            Customer fare is still unpaid. The assigned rider may be stuck on the payment-wait
            screen.
          </p>
          <button
            type="button"
            onClick={onClearHold}
            disabled={clearingHold}
            className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {clearingHold ? "Clearing…" : "Clear rider payment hold"}
          </button>
        </div>
      ) : adminCleared && statusUpper === "DELIVERED" && farePending ? (
        <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
          Rider payment hold cleared — rider can receive new offers.
        </p>
      ) : null}

      <button
        type="button"
        onClick={onCreateRefund}
        disabled={refundDisabled || !onCreateRefund}
        title={refundDisabledReason}
        className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
      >
        Create refund
      </button>
      {refundDisabled && refundDisabledReason ? (
        <p className="-mt-2 text-center text-[10px] text-slate-500">{refundDisabledReason}</p>
      ) : null}

      {Array.isArray(refunds) && refunds.length > 0 ? (
        <section className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm">
          <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
            <h3 className="text-[13px] font-semibold text-slate-900">Refund log</h3>
            <span className="text-[10px] font-medium text-slate-500">
              {refunds.length} recorded
            </span>
          </div>
          <ul className="max-h-44 space-y-2 overflow-y-auto">
            {refunds.map((r) => {
              const created = r.createdAt ? new Date(r.createdAt) : null;
              const time =
                created && !Number.isNaN(created.getTime())
                  ? created.toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—";
              return (
                <li key={r.id} className="rounded-md bg-slate-50 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="pr-num text-[11px] font-semibold text-emerald-700">
                      ₹{Number(r.refundAmount || 0).toFixed(2)}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      {r.refundStatus ? titleCaseStatusWords(String(r.refundStatus)) : "—"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-600">
                    {r.refundReason?.trim() || r.refundType || "Refund"}
                  </p>
                  <p className="mt-0.5 text-[9px] text-slate-400">
                    {time}
                    {r.initiatedByEmail ? ` · ${r.initiatedByEmail}` : ""}
                    {r.executionStatus ? ` · ${r.executionStatus}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="text-[13px] font-semibold text-slate-900">Add remarks</h3>
          <span className="text-[10px] font-medium text-slate-500">
            {loadingRemarks ? "…" : `${remarks.length} saved`}
          </span>
        </div>
        <div className="space-y-2">
          <select
            value={remarkType}
            onChange={(e) => setRemarkType(e.target.value as RemarkCategory)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="CUSTOMER">CUSTOMER</option>
            <option value="RIDER">RIDER</option>
            <option value="OTHER">OTHER</option>
          </select>
          <textarea
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder="Add your comment here…"
            className="min-h-[60px] w-full rounded border border-slate-200 bg-white p-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => void addRemark()}
            disabled={savingRemark || !remarkText.trim()}
            className="flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-70"
          >
            {savingRemark ? "Saving…" : "Submit"}
          </button>
        </div>

        {remarks.length > 0 ? (
          <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-slate-100 pt-2">
            {remarks.slice(0, 8).map((r) => (
              <li key={r.id} className="rounded-md bg-slate-50 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-emerald-700">
                    {titleCaseStatusWords(r.type)}
                  </span>
                  <span className="pr-num text-[9px] text-slate-500">{r.time}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-700">{r.content}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

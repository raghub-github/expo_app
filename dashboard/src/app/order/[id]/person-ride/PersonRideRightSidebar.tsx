"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, ClipboardCheck, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { OrderPageOverlay } from "@/components/orders/OrderPageOverlay";
import { OrderMixedText, OrderNum } from "@/components/orders/orders-typography";
import {
  mapNotificationsFromApi,
  mapReconsFromApi,
  type SidebarCxNotification,
  type SidebarRecon,
} from "@/lib/orders/order-sidebar-activity";
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

type CxTemplate = { code: string; label: string };

const RECON_REASON_OPTIONS = [
  "Customer denying order",
  "Customer non-responsive",
  "Wrong user address",
  "Unsafe area",
  "Out of subzone / area",
  "FE - No answer",
  "FE - Device / App issue",
  "FE - Accident / Rain / Strike / Vehicle issue",
  "FE - Long distance order",
  "Denial - Pickup timeout",
  "Denial - Rider abusive",
  "Rider fled with the order",
  "Rider charging extra",
  "Instructions not followed",
  "Duplicate Order",
  "Auto cancelled",
  "Other",
] as const;

export default function PersonRideRightSidebar({
  order,
  paymentPanel,
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
  /** Payment details card — rendered above Create refund (parcel/food ops parity). */
  paymentPanel?: ReactNode;
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

  const [cxTemplates, setCxTemplates] = useState<CxTemplate[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState("");
  const [savingNotification, setSavingNotification] = useState(false);
  const [notifications, setNotifications] = useState<SidebarCxNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  const [recons, setRecons] = useState<SidebarRecon[]>([]);
  const [reconRider, setReconRider] = useState("");
  const [reconReason, setReconReason] = useState("");
  const [reconText, setReconText] = useState("");
  const [savingRecon, setSavingRecon] = useState(false);
  const [loadingRecons, setLoadingRecons] = useState(false);
  const [showReconsModal, setShowReconsModal] = useState(false);

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

  const riderOptions = useMemo(() => {
    if (order.riderId == null || order.riderId <= 0) return [];
    const label = [order.riderName?.trim(), order.riderMobile?.trim()]
      .filter(Boolean)
      .join(" · ");
    return [
      {
        id: String(order.riderId),
        label: label || `Rider #${order.riderId}`,
      },
    ];
  }, [order.riderId, order.riderName, order.riderMobile]);

  useEffect(() => {
    if (riderOptions.length === 1 && !reconRider) {
      setReconRider(riderOptions[0]!.id);
    }
  }, [riderOptions, reconRider]);

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

  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/notifications`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: Array<{
          id: number;
          message: string;
          sentByEmail?: string | null;
          sentByName?: string | null;
          sentByRole?: string | null;
          sentAt?: string | Date;
          notificationMetadata?: unknown;
        }>;
      } | null;
      if (json?.success && Array.isArray(json.data)) {
        setNotifications(mapNotificationsFromApi(json.data));
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingNotifications(false);
    }
  }, [order.id]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/cx-notification-templates", {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: CxTemplate[];
        items?: CxTemplate[];
      } | null;
      const rows = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data)
          ? json.data
          : [];
      setCxTemplates(
        rows
          .map((t) => ({
            code: String(t.code ?? "").trim(),
            label: String(t.label ?? t.code ?? "").trim(),
          }))
          .filter((t) => t.code && t.code !== "ADMIN_CX_CUSTOM")
      );
    } catch {
      /* ignore */
    }
  }, []);

  const loadRecons = useCallback(async () => {
    setLoadingRecons(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/recons`, { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: Array<{
          id: number;
          providerName?: string | null;
          riderName?: string | null;
          riderMobile?: string | null;
          reconReason?: string | null;
          reconReasonCategory?: string | null;
          reconAt?: string | Date | null;
          actorEmail?: string | null;
          actorRole?: string | null;
        }>;
      } | null;
      if (!json?.success || !Array.isArray(json.data)) return;
      setRecons(
        mapReconsFromApi(
          json.data.map((r) => ({
            id: r.id,
            providerName: r.providerName ?? null,
            riderName: r.riderName ?? null,
            riderMobile: r.riderMobile ?? null,
            reconReason: String(r.reconReason ?? ""),
            reconReasonCategory: r.reconReasonCategory ?? null,
            reconAt: r.reconAt ?? new Date().toISOString(),
            actorEmail: r.actorEmail,
            actorRole: r.actorRole,
          }))
        )
      );
    } catch {
      /* ignore */
    } finally {
      setLoadingRecons(false);
    }
  }, [order.id]);

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      void loadRemarks();
      void loadNotifications();
      void loadTemplates();
      void loadRecons();
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(run, 200);
    }
    return () => {
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loadRemarks, loadNotifications, loadTemplates, loadRecons]);

  const addRemark = async () => {
    if (!remarkText.trim() || savingRemark) return;
    setSavingRemark(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remark: remarkText.trim(),
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

  const sendNotification = async () => {
    if (!selectedTemplateCode || savingNotification) return;
    setSavingNotification(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/notifications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateCode: selectedTemplateCode }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        routedToEmail?: string | null;
        routedToName?: string | null;
      } | null;
      if (!res.ok || !json?.success) {
        toast(json?.error ?? "Could not send notification.", "error");
        return;
      }
      setSelectedTemplateCode("");
      toast("Notification sent.", "success");
      onRoutedTo?.({
        email: json.routedToEmail ?? null,
        name: json.routedToName ?? null,
      });
      void loadNotifications();
    } catch {
      toast("Could not send notification.", "error");
    } finally {
      setSavingNotification(false);
    }
  };

  const addRecon = async () => {
    const preset = reconReason.trim();
    const typed = reconText.trim();
    const combined =
      preset && typed ? `${preset} !!!!!! ${typed}` : preset || typed;
    if (!reconRider || !combined || savingRecon) return;

    setSavingRecon(true);
    try {
      const trackingId =
        order.formattedOrderId ??
        order.orderId ??
        `GMP${String(order.id).padStart(6, "0")}`;
      const selected = riderOptions.find((r) => r.id === reconRider);
      const res = await fetch(`/api/orders/${order.id}/recons`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantStoreId: null,
          riderId: Number(reconRider),
          riderName: order.riderName ?? selected?.label ?? null,
          riderMobile: order.riderMobile ?? null,
          reasonPreset: preset || null,
          reasonText: typed || null,
          reconReason: combined,
          trackingId,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || json?.success === false) {
        toast(json?.error ?? "Failed to save recon.", "error");
        return;
      }
      setReconReason("");
      setReconText("");
      toast("Rider recon saved.", "success");
      void loadRecons();
    } catch {
      toast("Failed to save recon.", "error");
    } finally {
      setSavingRecon(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {paymentPanel ? <div className="min-w-0">{paymentPanel}</div> : null}

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

      <section className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
            <Bell className="h-3.5 w-3.5 text-emerald-500" />
            Send Cx notification
          </h3>
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
            onClick={() => {
              setShowNotificationsModal(true);
              void loadNotifications();
            }}
          >
            <i className="bi bi-list-check" />
            <OrderMixedText>{`See all (${notifications.length})`}</OrderMixedText>
          </button>
        </div>
        <div className="space-y-2">
          <select
            value={selectedTemplateCode}
            onChange={(e) => setSelectedTemplateCode(e.target.value)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select notification</option>
            {cxTemplates.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void sendNotification()}
            disabled={savingNotification || !selectedTemplateCode}
            className="flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60"
          >
            {savingNotification ? "Sending…" : "Send notification"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
            Rider Recon
          </h3>
          <button
            type="button"
            className="text-xs text-emerald-700 hover:text-emerald-800 cursor-pointer underline-offset-2 hover:underline"
            onClick={() => {
              setShowReconsModal(true);
              void loadRecons();
            }}
          >
            <OrderMixedText>{`See all (${recons.length})`}</OrderMixedText>
          </button>
        </div>
        <div className="space-y-2">
          <select
            value={reconRider}
            onChange={(e) => setReconRider(e.target.value)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Rider</option>
            {riderOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={reconReason}
            onChange={(e) => setReconReason(e.target.value)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Rejection Option (Optional)</option>
            {RECON_REASON_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <textarea
            value={reconText}
            onChange={(e) => setReconText(e.target.value)}
            placeholder="Add recon comment…"
            className="min-h-[52px] w-full rounded border border-slate-200 bg-white p-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => void addRecon()}
            disabled={
              savingRecon || !reconRider || (!reconReason.trim() && !reconText.trim())
            }
            className="flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60"
          >
            {savingRecon ? "Saving…" : "Submit recon"}
          </button>
        </div>
      </section>

      {showNotificationsModal ? (
        <OrderPageOverlay className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-2">
          <div className="w-full max-w-3xl rounded-xl border border-emerald-100 bg-[#f1faf5] shadow-xl">
            <div className="flex items-center justify-between border-b border-emerald-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-emerald-500" />
                <h2 className="text-[14px] font-semibold text-slate-800">
                  All Cx Notifications
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-emerald-50 hover:text-slate-700"
                onClick={() => setShowNotificationsModal(false)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-[440px] overflow-y-auto rounded-b-xl bg-white px-5 py-3">
              {loadingNotifications ? (
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
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-800">
                              {n.actorName || "Agent"}
                            </span>
                            {n.actorEmail ? (
                              <span className="rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-600">
                                {n.actorEmail}
                              </span>
                            ) : null}
                          </div>
                          {n.title ? (
                            <p className="text-[12px] font-semibold text-slate-900">
                              Title: {n.title}
                            </p>
                          ) : null}
                          <p className="whitespace-pre-line text-[12px] text-slate-700">
                            {n.body ?? n.message}
                          </p>
                        </div>
                        <div className="shrink-0 text-[11px] text-slate-500">
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
      ) : null}

      {showReconsModal ? (
        <OrderPageOverlay className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-3 py-4">
          <div className="flex max-h-[min(90vh,640px)] w-full max-w-3xl flex-col rounded-xl border border-emerald-100 bg-[#f1faf5] shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-emerald-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                <h2 className="text-[14px] font-semibold text-slate-800">
                  All Recons
                  {!loadingRecons && recons.length > 0 ? (
                    <span className="ml-1.5 font-normal text-slate-500">
                      ({recons.length})
                    </span>
                  ) : null}
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-emerald-50 hover:text-slate-700"
                onClick={() => setShowReconsModal(false)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl bg-white px-5 py-3">
              {loadingRecons ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading recons...</div>
              ) : recons.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">No recons available.</div>
              ) : (
                <ul className="space-y-3">
                  {recons.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12px] font-semibold text-slate-900">
                          {r.riderName || r.rider || "Rider"}
                        </p>
                        <span className="pr-num text-[10px] text-slate-500">{r.time}</span>
                      </div>
                      {r.reasonCategory ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-800">
                          {r.reasonCategory}
                        </p>
                      ) : null}
                      <p className="mt-0.5 whitespace-pre-line text-[11px] text-slate-700">
                        {r.comment || r.reason || "—"}
                      </p>
                      {r.actorEmail ? (
                        <p className="mt-1 text-[10px] text-slate-400">{r.actorEmail}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </OrderPageOverlay>
      ) : null}
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { formatWalletOrderDisplayId } from "@/lib/merchants/format-wallet-order-id";

export type ManualWalletAdjustmentSideSheetProps = {
  open: boolean;
  onClose: () => void;
  storeId: number | string;
  /** orders_core.id when opened from an order page */
  orderCoreId?: number | null;
  /** Public label e.g. GMF100041 */
  orderLabel?: string | null;
  /** Controlled Form/Request tab (URL-backed by parent when provided) */
  sheetTab?: SheetTab;
  onSheetTabChange?: (tab: SheetTab) => void;
  /** Optional soft refresh — must not reload the full order page */
  onSubmitted?: () => void;
};

export type SheetTab = "form" | "request";

type HistoryRow = {
  id: number;
  direction: string;
  amount: number;
  reason: string;
  status: string;
  order_id: number | null;
  formatted_order_id?: string | null;
  requested_at: string;
  requested_by_system_user_id: number | null;
  requested_by_name: string | null;
  requested_by_email: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  reviewed_by_email: string | null;
};

const REASON_HOVER_CHARS = 40;

function parseOrderIdInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/^#/, "");
  if (!cleaned) return null;
  if (/^\d+$/.test(cleaned)) {
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function statusBadgeClass(status: string): string {
  const s = String(status || "").toUpperCase();
  if (s === "PENDING") return "bg-amber-100 text-amber-800";
  if (s === "APPROVED") return "bg-emerald-100 text-emerald-800";
  return "bg-red-100 text-red-800";
}

export function ManualWalletAdjustmentSideSheet({
  open,
  onClose,
  storeId,
  orderCoreId,
  orderLabel,
  sheetTab: sheetTabProp,
  onSheetTabChange,
  onSubmitted,
}: ManualWalletAdjustmentSideSheetProps) {
  const { toast } = useToast();
  const [sheetTabInternal, setSheetTabInternal] = useState<SheetTab>("form");
  const sheetTab = sheetTabProp ?? sheetTabInternal;
  const setSheetTab = useCallback(
    (tab: SheetTab) => {
      onSheetTabChange?.(tab);
      if (sheetTabProp == null) setSheetTabInternal(tab);
    },
    [onSheetTabChange, sheetTabProp]
  );
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("DEBIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [mounted, setMounted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reasonHoverId, setReasonHoverId] = useState<number | null>(null);
  const [reasonPopover, setReasonPopover] = useState<{
    id: number;
    text: string;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const wasOpenRef = useRef(false);
  const historyAbortRef = useRef<AbortController | null>(null);
  const loadGenRef = useRef(0);
  const skipNextHistoryFetchRef = useRef(false);
  const reasonHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<HistoryRow[]>([]);
  historyRef.current = history;

  useEffect(() => {
    setMounted(true);
  }, []);

  const lockedOrderId = useMemo(() => {
    if (orderCoreId != null && Number.isFinite(Number(orderCoreId)) && Number(orderCoreId) > 0) {
      return Number(orderCoreId);
    }
    if (orderLabel) return parseOrderIdInput(String(orderLabel));
    return null;
  }, [orderCoreId, orderLabel]);

  const orderDisplay =
    formatWalletOrderDisplayId(
      orderLabel && String(orderLabel).trim() ? String(orderLabel).trim() : null,
      lockedOrderId
    )?.replace(/^#/, "") || "";

  const amountNum = parseFloat(amount);
  const reasonOk = reason.trim().length >= 5;
  const amountOk = Number.isFinite(amountNum) && amountNum > 0;
  const canSubmit = reasonOk && amountOk && !submitting && !!storeId;

  const subHeaderText =
    sheetTab === "request"
      ? "All wallet adjustment requests for this store."
      : "Submit a wallet credit or debit request.";

  const loadHistory = useCallback(async (opts?: { silent?: boolean }) => {
    if (!storeId) return;
    historyAbortRef.current?.abort();
    const ac = new AbortController();
    historyAbortRef.current = ac;
    const gen = ++loadGenRef.current;
    const timeoutId = window.setTimeout(() => ac.abort(), 20_000);

    // Only flash spinner when Request tab has nothing to show yet.
    const showSpinner = !opts?.silent && historyRef.current.length === 0;
    if (showSpinner) setHistoryLoading(true);
    setHistoryError(null);
    try {
      const q = new URLSearchParams({ limit: "50", offset: "0" });
      // Store-wide request history (pending + approved + rejected). Order is captured on Form submit.
      const res = await fetch(`/api/merchant/stores/${storeId}/wallet-requests?${q}`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: ac.signal,
      });
      if (gen !== loadGenRef.current) return;
      const data = await res.json().catch(() => ({}));
      if (gen !== loadGenRef.current) return;
      if (!res.ok) {
        if (historyRef.current.length === 0) setHistory([]);
        setHistoryError(
          typeof data?.error === "string" ? data.error : "Failed to load requests"
        );
        return;
      }
      const rows = Array.isArray(data?.requests) ? (data.requests as HistoryRow[]) : [];
      setHistory(rows);
      setHistoryError(null);
    } catch (err) {
      if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        return;
      }
      if (gen !== loadGenRef.current) return;
      if (historyRef.current.length === 0) setHistory([]);
      setHistoryError("Failed to load requests");
    } finally {
      window.clearTimeout(timeoutId);
      if (gen === loadGenRef.current) {
        setHistoryLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store-scoped list; order lock only for Form
  }, [storeId]);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      historyAbortRef.current?.abort();
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (justOpened) {
      // Prefer URL-controlled tab; only reset internal tab when uncontrolled.
      if (sheetTabProp == null) setSheetTabInternal("form");
      setDirection("DEBIT");
      setAmount("");
      setReason("");
      setSubmitting(false);
      setHistory([]);
      setHistoryError(null);
      setDeleteTarget(null);
      setReasonPopover(null);
      skipNextHistoryFetchRef.current = sheetTab === "request";
      // Prefetch while Form is visible so Request is instant; spinner only if opened on Request.
      void loadHistory({ silent: sheetTab !== "request" });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleteTarget && !reasonPopover) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, deleteTarget, reasonPopover, sheetTabProp, loadHistory]);

  useEffect(() => {
    if (!open || sheetTab !== "request") return;
    if (skipNextHistoryFetchRef.current) {
      skipNextHistoryFetchRef.current = false;
      return;
    }
    // Already have rows from open-prefetch — avoid spinner flash; soft refresh only.
    void loadHistory({ silent: historyRef.current.length > 0 });
  }, [open, sheetTab, loadHistory]);

  const clearReasonHoverTimer = () => {
    if (reasonHoverTimerRef.current) {
      clearTimeout(reasonHoverTimerRef.current);
      reasonHoverTimerRef.current = null;
    }
  };

  const openReasonPopover = (row: HistoryRow, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setReasonHoverId(row.id);
    setReasonPopover({
      id: row.id,
      text: row.reason,
      top: rect.bottom + 6,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 320)),
      width: Math.min(360, Math.max(rect.width, 220)),
    });
  };

  const scheduleCloseReasonPopover = () => {
    clearReasonHoverTimer();
    reasonHoverTimerRef.current = setTimeout(() => {
      setReasonHoverId(null);
      setReasonPopover(null);
    }, 120);
  };

  const handleSubmit = async (e?: MouseEvent | FormEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!canSubmit || submitting) return;

    const submittedDirection = direction;
    const submittedAmount = amountNum;
    const submittedReason = reason.trim();

    setSubmitting(true);
    try {
      const payload = {
        direction: submittedDirection,
        amount: submittedAmount,
        reason: submittedReason,
        ...(lockedOrderId != null ? { order_id: lockedOrderId } : {}),
        ...(orderDisplay ? { order_label: orderDisplay } : {}),
      };
      const res = await fetch(`/api/merchant/stores/${storeId}/wallet-requests`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok && data?.success) {
        const inserted = (data.request ?? {}) as Partial<HistoryRow>;
        const optimistic: HistoryRow = {
          id: Number(inserted.id) || Date.now(),
          direction: String(inserted.direction || submittedDirection),
          amount: Number(inserted.amount ?? submittedAmount),
          reason: String(inserted.reason || submittedReason),
          status: String(inserted.status || "PENDING"),
          order_id: lockedOrderId,
          formatted_order_id: orderDisplay || null,
          requested_at:
            typeof inserted.requested_at === "string"
              ? inserted.requested_at
              : new Date().toISOString(),
          requested_by_system_user_id:
            inserted.requested_by_system_user_id != null
              ? Number(inserted.requested_by_system_user_id)
              : null,
          requested_by_name:
            typeof inserted.requested_by_name === "string" ? inserted.requested_by_name : null,
          requested_by_email:
            typeof inserted.requested_by_email === "string" ? inserted.requested_by_email : null,
          reviewed_at: null,
          reviewed_by_name: null,
          reviewed_by_email: null,
        };

        // Instant UI: clear form, show Request tab with new row — no page reload / full refetch flash.
        setAmount("");
        setReason("");
        setHistory((prev) => [optimistic, ...prev.filter((r) => r.id !== optimistic.id)]);
        skipNextHistoryFetchRef.current = true;
        setSheetTab("request");
        toast("Adjustment request submitted");
        // Soft background sync only (does not reload the order page).
        queueMicrotask(() => {
          onSubmitted?.();
        });
      } else {
        toast(
          typeof data?.error === "string" ? data.error : "Failed to submit request"
        );
      }
    } catch {
      toast("Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !storeId) return;
    const removing = deleteTarget;
    setDeleteBusy(true);

    // Optimistic remove — sheet stays open, no page reload.
    setHistory((prev) => prev.filter((r) => r.id !== removing.id));
    setDeleteTarget(null);

    try {
      const res = await fetch(
        `/api/merchant/stores/${storeId}/wallet-requests/${removing.id}`,
        {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      );
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok && data?.success) {
        toast("Request deleted");
        queueMicrotask(() => {
          onSubmitted?.();
        });
      } else {
        setHistory((prev) => [removing, ...prev]);
        toast(typeof data?.error === "string" ? data.error : "Failed to delete request");
      }
    } catch {
      setHistory((prev) => [removing, ...prev]);
      toast("Failed to delete request");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!open || !mounted) return null;

  const formRequestToggle = (
    <div className="inline-flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-0.5 wallet-adj-controls">
      <button
        type="button"
        onClick={() => setSheetTab("form")}
        className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-semibold ${
          sheetTab === "form"
            ? "bg-indigo-600 text-white"
            : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        Form
      </button>
      <button
        type="button"
        onClick={() => setSheetTab("request")}
        className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-semibold ${
          sheetTab === "request"
            ? "bg-indigo-600 text-white"
            : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        Request
      </button>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[2400] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/40 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        className="relative flex h-dvh w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl wallet-adj-sheet sm:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-wallet-adjustment-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h2
            id="manual-wallet-adjustment-title"
            className="wallet-adj-title text-base font-bold text-gray-900"
          >
            Manual Wallet Adjustment
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="wallet-adj-controls shrink-0 cursor-pointer rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-slate-50 px-4 py-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-gray-600">
            {subHeaderText}
          </p>
          {formRequestToggle}
        </div>

        {sheetTab === "form" ? (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit(e);
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <div className="wallet-adj-controls flex gap-2">
                <button
                  type="button"
                  onClick={() => setDirection("CREDIT")}
                  className={`flex-1 cursor-pointer px-3 py-2 rounded-lg text-sm font-medium ${
                    direction === "CREDIT"
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Add (Credit)
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("DEBIT")}
                  className={`flex-1 cursor-pointer px-3 py-2 rounded-lg text-sm font-medium ${
                    direction === "DEBIT"
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Deduct (Debit)
                </button>
              </div>

              <div>
                <label className="wallet-adj-label block text-xs font-bold text-gray-700 mb-1">
                  Order ID
                </label>
                <input
                  type="text"
                  value={orderDisplay}
                  readOnly
                  className="wallet-adj-controls w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700 wallet-adj-num"
                  placeholder="—"
                />
                {lockedOrderId != null ? (
                  <p className="text-[10px] text-gray-500 mt-1">Captured from this order page.</p>
                ) : (
                  <p className="text-[10px] text-amber-700 mt-1">No order linked.</p>
                )}
              </div>

              <div>
                <label className="wallet-adj-label block text-xs font-bold text-gray-700 mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="wallet-adj-controls wallet-adj-num w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="wallet-adj-label block text-xs font-bold text-gray-700 mb-1">
                  Reason *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe why this adjustment is needed (min 5 chars)"
                  rows={3}
                  className="wallet-adj-controls w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
                {!reasonOk && reason.trim().length > 0 ? (
                  <p className="text-[10px] text-amber-700 mt-1">
                    Reason must be at least 5 characters.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="wallet-adj-controls shrink-0 border-t border-gray-200 px-4 py-3 flex items-center gap-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex cursor-pointer items-center justify-center gap-2 flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                Submit request
              </button>
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {historyLoading && history.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading…
              </div>
            ) : history.length === 0 ? (
              <div className="py-12 text-center">
                <p className="wallet-adj-title text-sm font-bold text-gray-700">No Record Found</p>
                {historyError ? (
                  <p className="mt-1 text-[11px] text-amber-700">{historyError}</p>
                ) : null}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[26rem] table-fixed divide-y divide-gray-200 text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="wallet-adj-label w-[22%] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                        Amount
                      </th>
                      <th className="wallet-adj-label w-[42%] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                        Reason
                      </th>
                      <th className="wallet-adj-label w-[24%] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                        By
                      </th>
                      <th className="wallet-adj-label w-[12%] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {history.map((r) => {
                      const isCredit = r.direction === "CREDIT";
                      const agentName = r.requested_by_name?.trim() || "—";
                      const agentEmail = r.requested_by_email?.trim() || null;
                      const reasonText = (r.reason || "").trim();
                      const reasonLong =
                        reasonText.length > REASON_HOVER_CHARS || reasonText.includes("\n");
                      return (
                        <tr key={r.id} className="align-top hover:bg-slate-50/80">
                          <td className="px-2.5 py-2">
                            <div
                              className={`text-[12px] font-semibold whitespace-nowrap wallet-adj-num ${
                                isCredit ? "text-emerald-600" : "text-red-600"
                              }`}
                            >
                              {isCredit ? "+" : "−"}₹
                              {Number(r.amount).toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                            <span
                              className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold wallet-adj-controls ${statusBadgeClass(
                                r.status
                              )}`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-2.5 py-2 text-[11px] text-gray-800">
                            <div
                              role={reasonLong ? "button" : undefined}
                              tabIndex={reasonLong ? 0 : undefined}
                              className={`wallet-adj-reason w-full text-left leading-snug line-clamp-2 break-words ${
                                reasonLong
                                  ? "cursor-help outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-sm"
                                  : "cursor-default"
                              } ${reasonHoverId === r.id ? "bg-amber-50/80" : ""}`}
                              title={reasonLong ? undefined : reasonText}
                              onMouseEnter={(e) => {
                                if (!reasonLong) return;
                                clearReasonHoverTimer();
                                openReasonPopover(r, e.currentTarget);
                              }}
                              onMouseLeave={() => {
                                if (!reasonLong) return;
                                scheduleCloseReasonPopover();
                              }}
                              onFocus={(e) => {
                                if (!reasonLong) return;
                                openReasonPopover(r, e.currentTarget);
                              }}
                              onBlur={() => {
                                if (!reasonLong) return;
                                scheduleCloseReasonPopover();
                              }}
                            >
                              {reasonText || "—"}
                            </div>
                          </td>
                          <td className="px-2.5 py-2 text-[11px] text-gray-800">
                            <div className="font-medium leading-snug break-words">{agentName}</div>
                            {agentEmail && agentEmail !== agentName ? (
                              <div className="mt-0.5 text-[10px] text-gray-500 break-all leading-snug wallet-adj-num">
                                {agentEmail}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-2.5 py-2 text-right">
                            {(() => {
                              const canDelete = String(r.status).toUpperCase() === "PENDING";
                              return (
                                <button
                                  type="button"
                                  disabled={!canDelete}
                                  onClick={() => {
                                    if (!canDelete) return;
                                    setDeleteTarget(r);
                                  }}
                                  className={`wallet-adj-controls inline-flex items-center justify-center rounded-md border p-1.5 ${
                                    canDelete
                                      ? "cursor-pointer border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                      : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300"
                                  }`}
                                  title={
                                    canDelete
                                      ? "Delete request"
                                      : "Only pending requests can be deleted"
                                  }
                                  aria-label={
                                    canDelete
                                      ? "Delete request"
                                      : "Delete disabled for approved or rejected"
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </aside>

      {reasonPopover ? (
        <div
          className="wallet-adj-reason-popover pointer-events-auto fixed z-[2450] rounded-xl border border-slate-700 bg-slate-900 p-3.5 shadow-2xl ring-1 ring-black/40"
          style={{
            top: reasonPopover.top,
            left: reasonPopover.left,
            width: Math.max(reasonPopover.width, 280),
            maxWidth: "min(380px, calc(100vw - 24px))",
          }}
          onMouseEnter={clearReasonHoverTimer}
          onMouseLeave={scheduleCloseReasonPopover}
        >
          <p className="wallet-adj-title mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            Full reason
          </p>
          <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-slate-50">
            {reasonPopover.text}
          </p>
        </div>
      ) : null}

      <ConfirmModal
        open={deleteTarget != null}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        confirmBusy={deleteBusy}
        variant="danger"
        title="Delete this request?"
        confirmLabel="Delete request"
        description={
          deleteTarget ? (
            <p>
              Remove this{" "}
              <span className="font-semibold">
                {deleteTarget.direction === "CREDIT" ? "credit" : "debit"} ₹
                {Number(deleteTarget.amount).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>{" "}
              request permanently. Wallet and ledger are unchanged until a request is approved.
              Other requests are not affected.
            </p>
          ) : null
        }
        zIndexClass="z-[2500]"
      />
    </div>,
    document.body
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { formatInr } from "@/lib/format-inr";

export type WalletApproveModalRequest = {
  id: number;
  direction: string;
  amount: number;
  reason: string;
  store_name?: string | null;
  store_code?: string | null;
  formatted_order_id?: string | null;
  order_id?: number | null;
};

type Props = {
  open: boolean;
  request: WalletApproveModalRequest | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: { amount: number; ledger_remark: string }) => void | Promise<void>;
};

/**
 * Admin approve modal: confirm amount + enter ledger remark.
 * Agent request reason is shown read-only and is never written to the ledger.
 */
export function WalletAdjustmentApproveModal({
  open,
  request,
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const [amount, setAmount] = useState("");
  const [ledgerRemark, setLedgerRemark] = useState("");

  useEffect(() => {
    if (!open || !request) return;
    setAmount(String(Number(request.amount) || ""));
    setLedgerRemark("");
  }, [open, request]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || !request) return null;

  const isCredit = request.direction === "CREDIT";
  const amountNum = parseFloat(amount);
  const remarkOk = ledgerRemark.trim().length >= 5;
  const amountOk = Number.isFinite(amountNum) && amountNum > 0;
  const canConfirm = remarkOk && amountOk && !busy;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[2600] flex items-center justify-center p-4" role="presentation">
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          aria-label="Close"
          disabled={busy}
          onClick={() => !busy && onClose()}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wallet-approve-title"
          className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <h2 id="wallet-approve-title" className="text-base font-semibold text-gray-900">
                Approve {isCredit ? "credit" : "debit"}
              </h2>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {request.store_name || "Store"}
                {request.store_code ? ` · ${request.store_code}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => !busy && onClose()}
              disabled={busy}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3 px-4 py-3">
            <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Agent request remark (not written to ledger)
              </p>
              <p className="mt-0.5 text-xs text-amber-950/80 whitespace-pre-wrap">{request.reason}</p>
              <p className="mt-1 text-[11px] font-medium tabular-nums text-amber-900">
                Requested: {isCredit ? "+" : "−"}
                {formatInr(request.amount)}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Amount to apply (₹) *
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Ledger remark *
              </label>
              <textarea
                value={ledgerRemark}
                onChange={(e) => setLedgerRemark(e.target.value)}
                disabled={busy}
                rows={3}
                placeholder="Remark that will appear on the store wallet ledger (min 5 chars)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 resize-none"
              />
              {!remarkOk && ledgerRemark.trim().length > 0 ? (
                <p className="mt-1 text-[10px] text-amber-700">Remark must be at least 5 characters.</p>
              ) : (
                <p className="mt-1 text-[10px] text-gray-500">
                  Only this remark is stored on the ledger. Agent remark stays on the request record.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => !busy && onClose()}
              disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={() =>
                void onConfirm({ amount: amountNum, ledger_remark: ledgerRemark.trim() })
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Approve &amp; post to ledger
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

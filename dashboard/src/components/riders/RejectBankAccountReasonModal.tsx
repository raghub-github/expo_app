"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type RejectBankAccountReasonModalProps = {
  riderLabel?: string | null;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

/**
 * Centered reject-reason modal for rider bank verification (replaces window.confirm).
 */
export function RejectBankAccountReasonModal({
  riderLabel,
  saving = false,
  onClose,
  onConfirm,
}: RejectBankAccountReasonModalProps) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 3 && !saving;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-bank-title"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 id="reject-bank-title" className="text-base font-bold text-gray-900">
              Reject bank account
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {riderLabel?.trim() || "Rider"} · reason is shown to the rider
            </p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Rejection reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            maxLength={500}
            disabled={saving}
            placeholder="e.g. Name does not match Aadhaar, invalid account details…"
            className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200 disabled:opacity-60"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Required (min 3 characters). Rider will see this reason in the app.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onConfirm(trimmed)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Rejecting…" : "Confirm reject"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

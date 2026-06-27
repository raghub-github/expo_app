"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type CustomerFraudReasonModalProps = {
  customerLabel?: string | null;
  reasons: string[];
  onClose: () => void;
};

export function CustomerFraudReasonModal({
  customerLabel,
  reasons,
  onClose,
}: CustomerFraudReasonModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fraud tag reason"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-red-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-red-900">Why is this customer marked Fraud?</h3>
            {customerLabel?.trim() ? (
              <p className="mt-0.5 text-xs text-red-800/80">{customerLabel.trim()}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-red-700 hover:bg-red-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="list-disc space-y-2 px-8 py-4 text-[13px] text-slate-800">
          {reasons.length > 0 ? (
            reasons.map((reason, idx) => <li key={`${idx}-${reason.slice(0, 24)}`}>{reason}</li>)
          ) : (
            <li>No fraud reason recorded.</li>
          )}
        </ul>
      </div>
    </div>,
    document.body
  );
}

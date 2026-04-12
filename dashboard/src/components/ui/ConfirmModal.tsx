"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styling for destructive actions (e.g. delete). */
  variant?: "default" | "danger";
  /** Disables actions and backdrop dismiss while an async confirm runs. */
  confirmBusy?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  /** z-index above other overlays (help topic editor uses z-[100]). */
  zIndexClass?: string;
};

/**
 * Centered confirmation dialog — use instead of `window.confirm` for consistent dashboard UI.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  confirmBusy = false,
  onClose,
  onConfirm,
  zIndexClass = "z-[110]",
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmBusy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirmBusy, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const confirmClasses =
    variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-red-400"
      : "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-400";

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 sm:p-6`}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="Close dialog"
        disabled={confirmBusy}
        onClick={() => {
          if (!confirmBusy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
          <h2 id="confirm-modal-title" className="text-base font-semibold text-gray-900 pr-2">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => !confirmBusy && onClose()}
            disabled={confirmBusy}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {description != null ? (
          <div className="px-4 py-3 sm:px-5 text-sm text-gray-600 leading-relaxed">{description}</div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3 sm:flex-row sm:justify-end sm:px-5 sm:py-3">
          <button
            type="button"
            onClick={() => !confirmBusy && onClose()}
            disabled={confirmBusy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmBusy}
            onClick={() => void onConfirm()}
            className={`rounded-lg px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed ${confirmClasses}`}
          >
            {confirmBusy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

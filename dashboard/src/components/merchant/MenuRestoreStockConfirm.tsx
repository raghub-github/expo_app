"use client";

import { createPortal } from "react-dom";

export type MenuRestoreStockConfirmProps = {
  open: boolean;
  busy: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MenuRestoreStockConfirm({
  open,
  busy,
  title,
  message,
  onCancel,
  onConfirm,
}: MenuRestoreStockConfirmProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm text-gray-900">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default !text-transparent"
        aria-label="Close"
        onClick={onCancel}
      />
      <div
        className="relative mx-3 w-full max-w-md rounded-2xl border border-gray-300 bg-white p-5 text-gray-900 shadow-2xl"
        style={{ colorScheme: "light" }}
      >
        <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-700">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 shadow-sm hover:bg-gray-50"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
            disabled={busy}
          >
            Bring back in stock
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

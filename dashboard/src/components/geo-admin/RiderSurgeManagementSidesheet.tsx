"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Zap } from "lucide-react";
import { RiderSurgeManagementPanel } from "./RiderSurgeManagementPanel";

export type RiderSurgeManagementSidesheetProps = {
  open: boolean;
  onClose: () => void;
  onCatalogChange?: () => void;
};

export function RiderSurgeManagementSidesheet({
  open,
  onClose,
  onCatalogChange,
}: RiderSurgeManagementSidesheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        aria-label="Close surge management"
        onClick={onClose}
      />
      <aside
        className="relative flex h-dvh w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rider-surge-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Zap className="h-5 w-5 shrink-0 text-amber-500" />
            <h2 id="rider-surge-sheet-title" className="truncate text-lg font-bold text-slate-900">
              Rider Surge Management
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <RiderSurgeManagementPanel variant="embedded" onCatalogChange={onCatalogChange} />
        </div>
      </aside>
    </div>,
    document.body
  );
}

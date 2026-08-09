"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Bike, X } from "lucide-react";
import type { SelfDeliveryRider } from "@/hooks/useMerchantApi";

type Props = {
  open: boolean;
  onClose: () => void;
  riders: SelfDeliveryRider[];
  loading?: boolean;
  storeName?: string;
};

export function PartnerSelfDeliveryRidersSheet({
  open,
  onClose,
  riders,
  loading,
  storeName,
}: Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex justify-end" role="presentation">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" aria-hidden onClick={onClose} />
      <aside
        className="relative flex h-dvh min-h-0 w-full max-w-md flex-col border-l border-slate-200/80 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="self-delivery-riders-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <Bike className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <h2 id="self-delivery-riders-sheet-title" className="text-sm font-semibold text-slate-900">
                Self-delivery riders
              </h2>
            </div>
            {storeName ? (
              <p className="mt-1 truncate text-xs text-slate-500">{storeName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading riders…</p>
          ) : riders.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No riders added yet.</p>
          ) : (
            <ul className="space-y-2">
              {riders.map((rider) => (
                <li
                  key={rider.id}
                  className="rounded-xl border border-slate-200/90 bg-slate-50/50 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{rider.rider_name}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{rider.rider_mobile}</p>
                      {rider.rider_email ? (
                        <p className="mt-0.5 truncate text-xs text-slate-500">{rider.rider_email}</p>
                      ) : null}
                      {rider.vehicle_number ? (
                        <p className="mt-0.5 text-xs text-slate-500">Vehicle: {rider.vehicle_number}</p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        rider.is_active
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                      }`}
                    >
                      {rider.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span className="font-mono">ID {rider.id}</span>
                    {rider.is_primary ? (
                      <span className="rounded bg-orange-50 px-1.5 py-0.5 font-semibold text-orange-700">
                        Primary
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

"use client";

import { X } from "lucide-react";
import { OrderNum, OrderMixedText } from "@/components/orders/orders-typography";

export type RejectionInfoSideSheetEntry = {
  id: string;
  kind: "refund" | "cancellation" | "merged";
  reason: string;
  detail: string | null;
  source: string | null;
  by: string | null;
  at: string;
  rider: string | null;
  amount: string | null;
  status: string | null;
};

export function RejectionInfoEntryCard({
  entry,
}: {
  entry: RejectionInfoSideSheetEntry;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            entry.kind === "refund"
              ? "bg-red-50 text-red-700 border border-red-100"
              : "bg-rose-50 text-rose-800 border border-rose-100"
          }`}
        >
          {entry.kind === "refund" ? "Refund / Cancel" : "Cancellation"}
        </span>
        {entry.status ? (
          <span className="text-[10px] font-medium text-slate-500 uppercase">
            {entry.status}
          </span>
        ) : null}
      </div>
      <p className="text-slate-800 text-[12px] leading-snug">
        <span className="font-medium text-slate-700">Reason:</span> {entry.reason}
      </p>
      {entry.detail ? (
        <p className="text-slate-600 text-[11px] leading-relaxed whitespace-pre-wrap">
          {entry.detail}
        </p>
      ) : null}
      {entry.source ? (
        <p className="text-[11px] text-slate-600">
          <span className="font-medium text-slate-600">Canceled by:</span> {entry.source}
        </p>
      ) : null}
      {entry.rider ? (
        <p className="text-[11px] text-slate-600">
          <span className="font-medium text-slate-600">Rider:</span> {entry.rider}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span>
          <span className="font-medium text-slate-600">Rejected at:</span>{" "}
          <OrderNum>{entry.at}</OrderNum>
        </span>
        {entry.by ? (
          <span>
            <span className="font-medium text-slate-600">Rejected by:</span> {entry.by}
          </span>
        ) : null}
      </div>
      {entry.amount ? (
        <p className="text-[11px] text-slate-500 pt-0.5">
          <OrderMixedText>{`Refund amount: ₹${entry.amount}`}</OrderMixedText>
        </p>
      ) : null}
    </div>
  );
}

/** Full rejection / refund history for an order. */
export function RejectionInfoSideSheet({
  open,
  onClose,
  orderIdText,
  entries,
}: {
  open: boolean;
  onClose: () => void;
  orderIdText?: string | null;
  entries: RejectionInfoSideSheetEntry[];
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-800">
              Rejection Info
              {orderIdText ? (
                <span className="font-normal text-slate-500">
                  {" "}
                  · <span className="font-semibold text-slate-700">{orderIdText}</span>
                </span>
              ) : null}
            </h2>
            <p className="text-[11px] text-slate-500">
              {entries.length} record{entries.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500">No rejection records.</p>
          ) : (
            entries.map((entry) => (
              <RejectionInfoEntryCard key={entry.id} entry={entry} />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

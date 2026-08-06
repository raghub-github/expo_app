"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type { ParcelDetailOrder } from "./parcel-detail-types";
import { formatRideStatusLabel, normalizeStatus } from "../person-ride/person-ride-utils";

export type ParcelTicketSummary = {
  id: number;
  ticketNumber: string;
  status: string | null;
};

function statusChipClasses(status: string): string {
  const key = normalizeStatus(status);
  if (key === "delivered") return "bg-emerald-100 border-emerald-300 text-emerald-900";
  if (key === "cancelled") return "bg-sky-200 border-sky-300 text-sky-900";
  if (key === "failed") return "bg-red-50 border-red-200 text-red-800";
  if (["in_transit", "picked_up"].includes(key))
    return "bg-amber-50 border-amber-200 text-amber-800";
  if (["assigned", "accepted", "reached_store"].includes(key))
    return "bg-sky-50 border-sky-200 text-sky-800";
  return "bg-slate-100 border-slate-200 text-slate-700";
}

export default function ParcelOrderHeader({
  order,
  tickets,
  refreshing,
  onRefresh,
  routedToLabel,
}: {
  order: ParcelDetailOrder;
  tickets: ParcelTicketSummary[];
  refreshing: boolean;
  onRefresh: () => void;
  routedToLabel?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTicketsModal, setShowTicketsModal] = useState(false);

  const displayId =
    order.formattedOrderId?.trim() ||
    order.orderId?.trim() ||
    `GMC${String(order.id).padStart(6, "0")}`;
  const normalizedId = displayId.replace(/^#/, "");
  const idPrefix = normalizedId.length > 4 ? normalizedId.slice(0, -4) : normalizedId;
  const idLast4 = normalizedId.length > 4 ? normalizedId.slice(-4) : "";
  const idLast4Chars = idLast4.split("");

  const statusRaw = order.currentStatus ?? order.status;
  const statusLabel = formatRideStatusLabel(statusRaw);

  const createdLabel = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-IN", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })
    : "—";

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const handleCopyId = () => {
    if (!normalizedId || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(normalizedId).then(() => {
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => {
        setCopied(false);
        copyResetRef.current = null;
      }, 2500);
    });
  };

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-100 pb-2">
        <div>
          <h1 className="flex items-center gap-1.5 text-[16px] font-medium text-slate-900">
            <span className="text-slate-700">#</span>
            <span className="font-mono text-[15px] tracking-wide text-emerald-700">
              {idLast4 ? (
                <>
                  <span>{idPrefix}</span>
                  <span className="text-[15px] font-medium">{idLast4Chars[0]}</span>
                  <span className="text-[16px] font-semibold">{idLast4Chars[1]}</span>
                  <span className="text-[17px] font-semibold">{idLast4Chars[2]}</span>
                  <span className="text-[18px] font-bold">{idLast4Chars[3]}</span>
                </>
              ) : (
                normalizedId || "—"
              )}
            </span>
            <button
              type="button"
              onClick={handleCopyId}
              className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-slate-500 transition hover:text-slate-700 ${
                copied ? "min-h-5 px-0.5" : "h-5 w-5"
              }`}
              aria-label={copied ? "Copied" : "Copy order ID"}
            >
              {copied ? (
                <span className="whitespace-nowrap text-[10px] font-medium text-emerald-600" role="status">
                  Copied
                </span>
              ) : (
                <span className="text-[10px]" aria-hidden>
                  ⧉
                </span>
              )}
            </button>
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-600">
            <span className="text-slate-800">{createdLabel}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-[11px]">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {routedToLabel?.trim() ? (
              <p className="text-[11px] text-slate-500">
                Routed To:{" "}
                <span className="font-medium text-slate-800">{routedToLabel.trim()}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              title="Refresh order details"
              aria-label="Refresh order details"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            </button>
          </div>
        </div>
      </section>

      <section className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
        <div className="flex min-w-[260px] flex-1 flex-wrap items-center gap-2">
          {tickets.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowTicketsModal(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <span className="font-mono">{tickets[0].ticketNumber}</span>
                <span className="text-emerald-600/80">·</span>
                <span>
                  {tickets[0].status
                    ? tickets[0].status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                    : "—"}
                </span>
              </span>
              {tickets.length > 1 ? (
                <span className="text-[10px] text-slate-500">+{tickets.length - 1} more</span>
              ) : null}
              <span className="ml-0.5 text-[10px] text-slate-500">▾</span>
            </button>
          ) : null}
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-normal ${statusChipClasses(
              statusRaw
            )}`}
          >
            Order status:&nbsp;
            <span className="font-medium">{statusLabel.toUpperCase()}</span>
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-normal text-slate-700">
            Order category:&nbsp;
            <span className="font-medium">Parcel</span>
          </span>
        </div>
      </section>

      {showTicketsModal && tickets.length > 0 ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTicketsModal(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-4 text-[12px] text-slate-800 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-xs font-semibold text-slate-900">Linked tickets</h2>
              <button
                type="button"
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowTicketsModal(false)}
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="space-y-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <a
                    href={`/dashboard/tickets/${t.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 hover:bg-slate-50"
                  >
                    <span className="font-mono text-[11px] font-semibold text-emerald-700">
                      {t.ticketNumber}
                    </span>
                    <span className="text-[11px] text-slate-600">
                      {t.status
                        ? t.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                        : "—"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

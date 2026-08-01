"use client";

import { useEffect, useState } from "react";
import { Ban, Globe, RefreshCw } from "lucide-react";
import type { TicketDetail } from "@/hooks/tickets/useTicketDetail";
import { loraDisplay as lora } from "@/lib/fonts/tickets-fonts";

function formatSnoozeCountdown(snoozedUntil: string): { label: string; tone: "violet" | "amber" | "red" } | null {
  const endMs = new Date(snoozedUntil).getTime();
  if (!Number.isFinite(endMs)) return null;
  const diff = endMs - Date.now();
  if (diff <= 0) return { label: "Resuming now", tone: "red" };
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tone: "violet" | "amber" | "red" = totalSeconds < 60 ? "red" : totalSeconds < 300 ? "amber" : "violet";
  if (hours > 0) return { label: `Resumes in ${hours}h ${minutes}m ${seconds}s`, tone };
  if (minutes > 0) return { label: `Resumes in ${minutes}m ${seconds}s`, tone };
  return { label: `Resumes in ${seconds}s`, tone };
}

export interface TicketHeaderProps {
  ticket: TicketDetail;
  /** When > 0, show chip for new inbound (customer/merchant/rider) messages while on this ticket. */
  newUpdatesCount?: number;
  onDismissUpdates?: () => void;
  variant?: "full" | "subjectOnly" | "metaOnly";
}

/** Reference layout: compact ticket title with source icon (M/R/C), "Created by X", tags and store info — data from Supabase only. */
export function TicketHeader({
  ticket,
  newUpdatesCount = 0,
  onDismissUpdates,
  variant = "full",
}: TicketHeaderProps) {
  const createdBy =
    ticket.raisedByName && String(ticket.raisedByName).trim()
      ? ticket.raisedByName
      : ticket.sourceRole && String(ticket.sourceRole).trim()
        ? String(ticket.sourceRole).replace(/_/g, " ").toUpperCase()
        : "System";
  const showChip = newUpdatesCount > 0;
  const subjectRaw = ticket.subject && ticket.subject.trim() !== "" ? ticket.subject : "No subject";
  const normalizedSubject =
    subjectRaw.length > 0 ? `${subjectRaw.charAt(0).toUpperCase()}${subjectRaw.slice(1)}` : subjectRaw;
  const showSubject = variant !== "metaOnly";
  const showMeta = variant !== "subjectOnly";
  const [countdown, setCountdown] = useState<{ label: string; tone: "violet" | "amber" | "red" } | null>(
    ticket.status === "snoozed" && ticket.snoozedUntil ? formatSnoozeCountdown(ticket.snoozedUntil) : null
  );
  const [showSnoozeDetails, setShowSnoozeDetails] = useState(false);

  useEffect(() => {
    if (ticket.status !== "snoozed" || !ticket.snoozedUntil) {
      setCountdown(null);
      return;
    }
    const update = () => setCountdown(formatSnoozeCountdown(ticket.snoozedUntil!));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [ticket.status, ticket.snoozedUntil]);

  return (
    <div className={`bg-white ${showSubject ? "pt-1" : ""}`}>
      {showSubject && (
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-gray-500">
            <Globe className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="flex flex-wrap items-center gap-2 text-[20px] font-semibold leading-[1.25] tracking-tight text-[#1f2937]">
                <span className={lora.className}>{normalizedSubject}</span>
                {countdown ? (
                  <button
                    type="button"
                    onClick={() => setShowSnoozeDetails((v) => !v)}
                    title={ticket.snoozeReason ? `Reason: ${ticket.snoozeReason}` : "No snooze reason added"}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      countdown.tone === "red"
                        ? "bg-red-50 text-red-700"
                        : countdown.tone === "amber"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-violet-50 text-violet-700"
                    }`}
                  >
                    {countdown.label}
                  </button>
                ) : null}
              </h1>
              {countdown && showSnoozeDetails ? (
                <p className="mt-1 text-[11px] text-gray-600">
                  Snooze reason:{" "}
                  <span className="font-medium text-gray-700">
                    {ticket.snoozeReason && ticket.snoozeReason.trim() !== "" ? ticket.snoozeReason : "Not provided"}
                  </span>
                </p>
              ) : null}
              <span className="mr-3 flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-[12px] font-medium text-slate-600 sm:mr-4">
                {ticket.isSpam ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-rose-300/90 bg-gradient-to-b from-rose-50 to-rose-100/95 px-2 py-0.5 text-[11px] font-semibold tracking-tight text-rose-900 shadow-sm ring-1 ring-rose-200/60"
                    role="status"
                    aria-label="Ticket marked as spam"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-200/70 text-rose-900">
                      <Ban className="h-2.5 w-2.5 shrink-0" strokeWidth={2.25} aria-hidden />
                    </span>
                    Spammed.
                  </span>
                ) : null}
                <span>TKT ID: {ticket.ticketNumber || ticket.id}</span>
              </span>
            </div>
            {showChip ? (
              <div className="mt-1.5 flex w-full justify-center pr-3 sm:pr-4">
                <button
                  type="button"
                  onClick={onDismissUpdates}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-700 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-blue-800 transition-colors hover:bg-gray-200"
                  aria-label={`${newUpdatesCount} update${newUpdatesCount !== 1 ? "s" : ""}`}
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  {newUpdatesCount} update{newUpdatesCount !== 1 ? "s" : ""}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {showMeta && (
        <div className={showSubject ? "pl-[30px]" : "pl-[30px]"}>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-xs text-gray-600">
              Created by <span className="font-semibold text-gray-700">{createdBy}</span>
            </p>
            {ticket.status === "snoozed" && ticket.snoozedUntil ? (
              <p className="text-xs text-violet-700">
                Snoozed until <span className="font-semibold">{new Date(ticket.snoozedUntil).toLocaleString()}</span>
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

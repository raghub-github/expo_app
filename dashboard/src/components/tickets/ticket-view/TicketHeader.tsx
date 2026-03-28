"use client";

import { Lora } from "next/font/google";
import { Ban, Globe, RefreshCw } from "lucide-react";
import type { TicketDetail } from "@/hooks/tickets/useTicketDetail";

const lora = Lora({
  subsets: ["latin"],
  weight: ["600", "700"],
});

export interface TicketHeaderProps {
  ticket: TicketDetail;
  /** When > 0, show chip "N update(s)" centered under the title row (subject variant only). */
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

  return (
    <div className={`bg-white ${showSubject ? "pt-1" : ""}`}>
      {showSubject && (
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-gray-500">
            <Globe className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-[20px] font-semibold leading-[1.25] tracking-tight text-[#1f2937]">
                <span className={lora.className}>{normalizedSubject}</span>
              </h1>
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
          </div>
        </div>
      )}
    </div>
  );
}

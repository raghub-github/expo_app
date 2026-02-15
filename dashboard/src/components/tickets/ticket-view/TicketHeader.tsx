"use client";

import { RefreshCw } from "lucide-react";
import type { TicketDetail } from "@/hooks/tickets/useTicketDetail";

/** Icon letter by ticket source: Merchant → M, Rider → R, User/Customer → C. */
function sourceIconLetter(sourceRole: string): string {
  const s = (sourceRole || "").toLowerCase().trim();
  if (s.includes("merchant")) return "M";
  if (s.includes("rider")) return "R";
  return "C"; // customer, user, portal, system, etc.
}

export interface TicketHeaderProps {
  ticket: TicketDetail;
  /** When > 0, show chip badge "N update(s)" to the right of subject (new ticket/updates received). */
  newUpdatesCount?: number;
  onDismissUpdates?: () => void;
}

/** Reference layout: compact ticket title with source icon (M/R/C), "Created by X", tags and store info — data from Supabase only. */
export function TicketHeader({ ticket, newUpdatesCount = 0, onDismissUpdates }: TicketHeaderProps) {
  const createdBy =
    ticket.raisedByName && String(ticket.raisedByName).trim()
      ? ticket.raisedByName
      : ticket.sourceRole && String(ticket.sourceRole).trim()
        ? String(ticket.sourceRole).replace(/_/g, " ").toUpperCase()
        : "System";
  const showChip = newUpdatesCount > 0;
  const iconLetter = sourceIconLetter(ticket.sourceRole);
  const displayTags = (ticket.tags ?? []).slice(0, 3);
  const isOverdue = Boolean(ticket.slaDueAt && new Date(ticket.slaDueAt) < new Date());
  const isMerchant = (ticket.sourceRole ?? "").toLowerCase().includes("merchant");
  const storeParentParts = [
    ticket.storeId != null && ticket.storeId !== "" && `Store ID ${ticket.storeId}`,
    ticket.storeNumber != null && ticket.storeNumber !== "" && `Store #${ticket.storeNumber}`,
    ticket.storeParentId != null && `Parent ID ${ticket.storeParentId}`,
    ticket.parentMerchantId != null && ticket.parentMerchantId !== "" && `Parent ${ticket.parentMerchantId}`,
    ticket.storePhone != null && ticket.storePhone !== "" && ticket.storePhone,
    ticket.parentPhone != null && ticket.parentPhone !== "" && ticket.parentPhone,
    ticket.storeEmail != null && ticket.storeEmail !== "" && ticket.storeEmail,
  ].filter(Boolean) as string[];
  const hasStoreInfo = isMerchant && storeParentParts.length > 0;

  return (
    <div className="bg-white">
      <div className="flex items-start gap-2">
        <div className="shrink-0 w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
          {iconLetter}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h1 className="text-base font-bold text-gray-900 leading-tight">
              {ticket.subject || ticket.title?.titleText || "No subject"}
            </h1>
            <span className="text-xs font-mono text-gray-500">
              #{ticket.ticketNumber || ticket.id}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-xs text-gray-500">
              Created by {createdBy}
            </p>
            {isOverdue && (
              <>
                <span className="text-gray-300">·</span>
                <span className="inline-flex rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  Overdue
                </span>
              </>
            )}
            {displayTags.length > 0 && (
              <>
                <span className="text-gray-300">·</span>
                {displayTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
              </>
            )}
            {hasStoreInfo && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-[10px] text-gray-500">
                  {storeParentParts.join(" · ")}
                </span>
              </>
            )}
          </div>
          {showChip && (
            <button
              type="button"
              onClick={onDismissUpdates}
              className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-700 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-blue-800 hover:bg-gray-200 transition-colors"
              aria-label={`${newUpdatesCount} update${newUpdatesCount !== 1 ? "s" : ""}`}
            >
              <RefreshCw className="h-2.5 w-2.5" />
              {newUpdatesCount} update{newUpdatesCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

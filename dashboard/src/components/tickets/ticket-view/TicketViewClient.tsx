"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TicketActionBar } from "./TicketActionBar";
import { TicketHeader } from "./TicketHeader";
import { ConversationPanel } from "./ConversationPanel";
import { ActivityTimeline } from "./ActivityTimeline";
import { addToRecentViewed } from "@/components/search/GlobalSearch";

export function TicketViewClient({ ticketId }: { ticketId: number }) {
  const { data: ticket, isLoading, error } = useTicketDetail(ticketId);
  const [showActivities, setShowActivities] = useState(false);
  // Filters button lives in Properties panel; keep no-op here for any stale refs
  const toggleFilterSidebar = () => {};

  useEffect(() => {
    if (ticket) {
      addToRecentViewed({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber ?? String(ticket.id),
        subject: ticket.subject ?? "",
      });
    }
  }, [ticket?.id, ticket?.ticketNumber, ticket?.subject]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-medium">Failed to load ticket</p>
        <p className="text-sm text-gray-600 mt-2">
          {error instanceof Error ? error.message : "Ticket not found"}
        </p>
        <Link
          href="/dashboard/tickets"
          className="mt-4 inline-block rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
        >
          Back to tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Breadcrumb (Filters button lives in Properties panel top) */}
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-600">
        <Link href="/dashboard/tickets" className="hover:text-blue-600">
          Open tickets
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono text-gray-900">#{ticket.ticketNumber || ticket.id}</span>
      </div>

      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 -mx-3 px-3 py-2 sm:-mx-4 sm:px-4">
        <TicketActionBar
          ticketId={ticket.id}
          ticketNumber={ticket.ticketNumber || String(ticket.id)}
          showActivities={showActivities}
          onToggleActivities={() => setShowActivities((v) => !v)}
        />
      </div>

      {/* Ticket header */}
      <TicketHeader ticket={ticket} />

      {/* Conversation + optional activity */}
      <div className="flex-1 min-h-0 flex flex-col gap-4 mt-4">
        <ConversationPanel ticketId={ticket.id} messages={ticket.messages || []} />
        {showActivities && (
          <ActivityTimeline ticketId={ticket.id} />
        )}
      </div>
    </div>
  );
}

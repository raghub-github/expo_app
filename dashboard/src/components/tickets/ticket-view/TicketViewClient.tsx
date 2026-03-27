"use client";

import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTicketDetail } from "@/hooks/tickets/useTicketDetail";
import { queryKeys } from "@/lib/queryKeys";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AttachmentModal, isImageUrl } from "./AttachmentModal";
import { TicketActionBar } from "./TicketActionBar";
import { TicketHeader } from "./TicketHeader";
import { ConversationPanel } from "./ConversationPanel";
import { ActivityTimeline } from "./ActivityTimeline";
import { addToRecentViewed } from "@/components/search/GlobalSearch";
import { Paperclip } from "lucide-react";

const STORAGE_KEY_PREFIX = "ticket-last-viewed-";

function formatCreatedLong(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStoredLastViewed(ticketId: number): { updatedAt: string; messageCount: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PREFIX + ticketId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt?: string; messageCount?: number };
    return parsed?.updatedAt != null ? { updatedAt: parsed.updatedAt, messageCount: parsed.messageCount ?? 0 } : null;
  } catch {
    return null;
  }
}

function setStoredLastViewed(ticketId: number, updatedAt: string, messageCount: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY_PREFIX + ticketId, JSON.stringify({ updatedAt, messageCount }));
  } catch {}
}

export function TicketViewClient({ ticketId }: { ticketId: number | string }) {
  const { data: ticket, isLoading, isFetching, error } = useTicketDetail(ticketId);
  const [allowErrorRender, setAllowErrorRender] = useState(false);
  const [showActivities, setShowActivities] = useState(false);
  const [showReplySection, setShowReplySection] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; name: string } | null>(null);
  const [newUpdatesCount, setNewUpdatesCount] = useState(0);
  const queryClient = useQueryClient();
  const onMessageSent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets.activities(ticketId) });
  }, [queryClient, ticketId]);

  // Always refetch ticket when this view mounts so latest data and UI are shown.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketId) });
  }, [ticketId, queryClient]);

  // Reply box stays hidden until user clicks Reply; do not auto-open on refresh or hash

  useEffect(() => {
    if (ticket) {
      addToRecentViewed({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber ?? String(ticket.id),
        subject: ticket.subject ?? "",
      });
    }
  }, [ticket?.id, ticket?.ticketNumber, ticket?.subject]);

  // Chip badge: show when there are updates since last view (stored baseline)
  useEffect(() => {
    if (!ticket) return;
    const stored = getStoredLastViewed(ticket.id);
    const messages = ticket.messages ?? [];
    if (!stored) {
      setNewUpdatesCount(0);
      return;
    }
    const updatedAfter = ticket.updatedAt && stored.updatedAt ? new Date(ticket.updatedAt) > new Date(stored.updatedAt) : false;
    const newMessages = messages.length > stored.messageCount ? messages.length - stored.messageCount : 0;
    if (updatedAfter || newMessages > 0) {
      setNewUpdatesCount(Math.max(1, newMessages));
    } else {
      setNewUpdatesCount(0);
    }
  }, [ticket?.id, ticket?.updatedAt, ticket?.messages]);

  // Set "last viewed" baseline on first open so future visits can show update chip
  useEffect(() => {
    if (!ticket) return;
    if (getStoredLastViewed(ticket.id) != null) return;
    const t = setTimeout(() => {
      setStoredLastViewed(ticket.id, ticket.updatedAt, (ticket.messages ?? []).length);
    }, 2000);
    return () => clearTimeout(t);
  }, [ticket?.id, ticket?.updatedAt, ticket?.messages]);

  // Auto-dismiss chip after 3s (mark as viewed)
  useEffect(() => {
    if (!ticket || newUpdatesCount === 0) return;
    const t = setTimeout(() => {
      setStoredLastViewed(ticket.id, ticket.updatedAt, (ticket.messages ?? []).length);
      setNewUpdatesCount(0);
    }, 3000);
    return () => clearTimeout(t);
  }, [ticket?.id, ticket?.updatedAt, ticket?.messages, newUpdatesCount]);

  const handleDismissUpdates = useCallback(() => {
    if (!ticket) return;
    setStoredLastViewed(ticket.id, ticket.updatedAt, (ticket.messages ?? []).length);
    setNewUpdatesCount(0);
  }, [ticket?.id, ticket?.updatedAt, ticket?.messages]);

  // Show skeleton first while loading or fetching without data; only show error after load attempt finishes.
  useEffect(() => {
    if (ticket || isLoading || isFetching || !error) {
      setAllowErrorRender(false);
      return;
    }
    const id = window.setTimeout(() => setAllowErrorRender(true), 2200);
    return () => clearTimeout(id);
  }, [ticket, isLoading, isFetching, error]);

  const stillLoading = isLoading || (isFetching && !ticket);
  if (stillLoading) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <LoadingSpinner />
        <p className="text-sm text-gray-500 max-w-md">Getting everything ready...</p>
      </div>
    );
  }

  if ((error || !ticket) && allowErrorRender) {
    return (
      <div className="flex h-full min-h-[70vh] items-center justify-center px-6 text-center">
        <div className="max-w-md text-gray-800">
          <p className="text-lg font-semibold tracking-tight">😒 Ohh Nooo......</p>
          <p className="mt-3 text-base font-normal text-gray-600">You took a wrong turn!</p>
        </div>
      </div>
    );
  }

  // Safety guard: while ticket is unresolved and error UI is intentionally delayed,
  // keep showing skeleton so we never access ticket.id on undefined.
  if (!ticket) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <LoadingSpinner />
        <p className="text-sm text-gray-500 max-w-md">Getting everything ready...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Sticky: action bar + ticket heading (compact; no breadcrumb above buttons) */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 -mx-3 px-3 pb-2 sm:-mx-4 sm:px-4 shrink-0">
        <TicketActionBar
          ticketId={ticket.id}
          ticketNumber={ticket.ticketNumber || String(ticket.id)}
          showActivities={showActivities}
          onToggleActivities={() => setShowActivities((v) => !v)}
          onReplyClick={() => setShowReplySection(true)}
        />
        {!showActivities && (
          <div className="mt-2">
            <TicketHeader
              ticket={ticket}
              newUpdatesCount={newUpdatesCount}
              onDismissUpdates={handleDismissUpdates}
            />
          </div>
        )}
      </div>

      {/* Scrollable: description+attachments, conversation. Reply composer is in document flow (no fixed/sticky) so it scrolls with page and never overlaps. */}
      <div className={`flex-1 min-h-0 overflow-y-auto ${showReplySection ? "pb-8" : "pb-4"}`}>
        {showActivities ? (
          <div className="mt-2 px-0">
            <ActivityTimeline ticketId={ticket.id} noScroll />
          </div>
        ) : (
          <>
            {/* Description + attachments: reference style — avatar, "X reported via the portal", timestamp, then body and attachments */}
            {(ticket.description || (ticket.attachments && ticket.attachments.length > 0)) && (
              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                {ticket.description && (
                  <>
                    <div className="flex gap-3">
                      <div className="shrink-0 w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {(ticket.raisedByName || ticket.sourceRole || "R").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">
                          <span className="font-medium text-blue-600">{ticket.raisedByName || ticket.sourceRole || "Customer"}</span>
                          <span className="text-gray-700"> reported via the portal</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatCreatedLong(ticket.createdAt)}
                        </div>
                        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">{ticket.description}</p>
                      </div>
                    </div>
                  </>
                )}
                {ticket.attachments && ticket.attachments.length > 0 && (
                  <div className={ticket.description ? "mt-2 pt-2 border-t border-gray-200" : ""}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mr-0.5">Attachments</span>
                      {ticket.attachments.map((att, i) => {
                        const url = typeof att === "string" ? att : (att as { url?: string })?.url ?? "#";
                        const name = typeof att === "string" ? "" : (att as { name?: string })?.name ?? "";
                        const isImage = isImageUrl(url);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setAttachmentPreview({ url, name: name || (isImage ? "Image" : "File") })}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-1 hover:bg-gray-50 text-left focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[140px]"
                            title={name || (isImage ? "View image" : "View file")}
                          >
                            {isImage ? (
                              <img src={url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                            ) : (
                              <Paperclip className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                            )}
                            <span className="text-[10px] text-gray-600 truncate min-w-0">{name || "File"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {attachmentPreview && (
              <AttachmentModal
                url={attachmentPreview.url}
                name={attachmentPreview.name}
                onClose={() => setAttachmentPreview(null)}
              />
            )}

            {/* Conversation: flows with page, no separate scrollbar */}
            <div className="mt-2">
              <ConversationPanel
                ticketId={ticket.id}
                messages={ticket.messages || []}
                recipientEmail={ticket.raisedByEmail ?? undefined}
                onMessageSent={onMessageSent}
                replyVisible={showReplySection}
                onCloseReply={() => setShowReplySection(false)}
                noScroll
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

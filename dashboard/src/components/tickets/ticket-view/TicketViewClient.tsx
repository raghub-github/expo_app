"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTicketUrlPanel, useTicketPanelNavigation } from "@/hooks/tickets/useTicketUrlPanel";
import {
  useTicketDetail,
  type TicketDetail,
  type TicketMessage,
  type TicketMessageSentPayload,
} from "@/hooks/tickets/useTicketDetail";
import { queryKeys } from "@/lib/queryKeys";
import { isImageUrl } from "./AttachmentModal";
import {
  isCorporateEnquiryTicket,
  isSystemOtherTicketGroup,
  parseCorporateEnquiryFromDescription,
} from "@/lib/tickets/corporate-enquiry-fields";
import { TicketActionBar } from "./TicketActionBar";
import { TicketHeader } from "./TicketHeader";
import { ConversationPanel } from "./ConversationPanel";
import { ActivityTimeline, fetchTicketActivities, TICKET_ACTIVITIES_STALE_MS } from "./ActivityTimeline";
import { TicketCsatPanel } from "./TicketCsatPanel";
import { AgentActivityPageClient } from "@/components/tickets/AgentActivityPageClient";
import { addToRecentViewed } from "@/components/search/GlobalSearch";
import { Check, Copy, Download, Globe, Paperclip } from "lucide-react";
import { useRightSidebar } from "@/context/RightSidebarContext";
import { useAuth } from "@/providers/AuthProvider";
import { useTicketRoomRealtime, type TicketRoomPresenceIdentity } from "@/hooks/tickets/useTicketRoomRealtime";

const STORAGE_KEY_PREFIX = "ticket-last-viewed-";

function TicketDetailLoadingShell() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col animate-pulse bg-[#f5f7f9]">
      <div className="h-12 shrink-0 border-b border-gray-200 bg-white" />
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="h-20 rounded-lg bg-white/90" />
        <div className="min-h-0 flex-1 rounded-lg bg-white/80" />
      </div>
    </div>
  );
}

const IMAGE_FILENAME = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i;

/** DB / proxy URLs often lack a file extension on the pathname; still treat as image when possible. */
function isHeaderAttachmentImage(url: string, fileName: string, mimeType?: string | null): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (fileName && IMAGE_FILENAME.test(fileName.toLowerCase())) return true;
  if (isImageUrl(url)) return true;
  if (!url || url === "#") return false;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(url, base);
    const key = u.searchParams.get("key");
    if (key && IMAGE_FILENAME.test(decodeURIComponent(key))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function attachmentRowMeta(att: string | { url?: string; name?: string; mimeType?: string; mime_type?: string }): {
  url: string;
  name: string;
  mimeType?: string;
} {
  if (typeof att === "string") {
    return { url: att, name: "" };
  }
  const url = typeof att.url === "string" ? att.url : "#";
  const name = typeof att.name === "string" ? att.name : "";
  const mimeType =
    typeof att.mimeType === "string" ? att.mimeType : typeof att.mime_type === "string" ? att.mime_type : undefined;
  return { url, name, mimeType };
}

function formatCreatedLong(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const relative =
    diffMins < 1
      ? "just now"
      : diffMins < 60
        ? `${diffMins}m ago`
        : diffHours < 24
          ? `${diffHours}h ago`
          : diffDays < 7
            ? `${diffDays}d ago`
            : `${diffDays}d ago`;
  const absolute = date.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${relative} (${absolute})`;
}

type LastViewedStored = {
  updatedAt: string;
  messageCount: number;
  /** Count of customer/merchant/rider/inbound thread rows (excludes agent + internal notes). */
  inboundCount: number;
};

/** Inbound “user side” thread activity — not agent replies or internal notes (avoids chip on spam/status-only saves). */
function isInboundUserSideMessage(msg: TicketMessage): boolean {
  if (msg.isInternalNote) return false;
  const mt = String(msg.messageType || "").toLowerCase();
  if (mt === "internal_note") return false;
  const t = (msg.senderType ?? "").trim().toUpperCase();
  if (t === "AGENT") return false;
  return true;
}

function countInboundUserMessages(messages: TicketMessage[]): number {
  return messages.filter(isInboundUserSideMessage).length;
}

function getStoredLastViewed(ticketId: number): LastViewedStored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PREFIX + ticketId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      updatedAt?: string;
      messageCount?: number;
      inboundCount?: number;
    };
    if (parsed?.updatedAt == null) return null;
    return {
      updatedAt: parsed.updatedAt,
      messageCount: parsed.messageCount ?? 0,
      inboundCount: parsed.inboundCount ?? -1,
    };
  } catch {
    return null;
  }
}

function setStoredLastViewed(ticketId: number, ticket: TicketDetail) {
  try {
    const messages = ticket.messages ?? [];
    const payload: LastViewedStored = {
      updatedAt: ticket.updatedAt,
      messageCount: messages.length,
      inboundCount: countInboundUserMessages(messages),
    };
    sessionStorage.setItem(STORAGE_KEY_PREFIX + ticketId, JSON.stringify(payload));
  } catch {}
}

/** Persist ticket inner view across refresh: ?panel=activities | ?panel=csat */
export function TicketViewClient({ ticketId }: { ticketId: number | string }) {
  const router = useRouter();
  const pathname = useAppPathname();
  const urlPanel = useTicketUrlPanel();
  const setTicketPanel = useTicketPanelNavigation(pathname, router);
  const rightSidebar = useRightSidebar();
  const { user: authUser, systemUser } = useAuth();
  const { data: ticket, isPending, isError, error } = useTicketDetail(ticketId);

  const showActivities = urlPanel === "activities";
  const showCsatPanel = urlPanel === "csat";
  const [showReplySection, setShowReplySection] = useState(false);
  const [quickComposeAction, setQuickComposeAction] = useState<{ type: "reply" | "forward" | "note_private" | "note_public"; nonce: number } | null>(null);
  const [newUpdatesCount, setNewUpdatesCount] = useState(0);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const sidebarStateBeforeLoadingRef = useRef<boolean | null>(null);
  const queryClient = useQueryClient();
  /** Same string id as useTicketDetail / list caches — avoids setQueryData missing the active query. */
  const ticketCacheId = String(ticketId).trim();
  const ticketNumericId = useMemo(() => {
    const parsed = Number(ticketCacheId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [ticketCacheId]);

  const [agentPresenceIdentity, setAgentPresenceIdentity] = useState<TicketRoomPresenceIdentity | null>(null);

  /** Bootstrap session carries Supabase user id; presence key must match JWT sub (same as system_users.system_user_id). */
  const authMeta = authUser?.user_metadata as { full_name?: unknown } | undefined;
  const fullNameFromAuthMeta =
    typeof authMeta?.full_name === "string" ? authMeta.full_name.trim() : "";

  useEffect(() => {
    const uid = (authUser?.id || systemUser?.systemUserId || "").trim();
    if (!uid) {
      setAgentPresenceIdentity(null);
      return;
    }
    const sysName = systemUser?.fullName?.trim() ?? "";
    const email =
      (typeof authUser?.email === "string" ? authUser.email.trim() : "") ||
      (systemUser?.email?.trim() ?? "");
    setAgentPresenceIdentity({
      userId: uid,
      role: "agent",
      displayName: fullNameFromAuthMeta || sysName || email || undefined,
    });
  }, [
    authUser?.id,
    authUser?.email,
    fullNameFromAuthMeta,
    systemUser?.systemUserId,
    systemUser?.fullName,
    systemUser?.email,
  ]);

  const { copresenceLive, otherAgentViewers } = useTicketRoomRealtime({
    ticketNumericId,
    ticketCacheId,
    presence: agentPresenceIdentity,
  });

  useEffect(() => {
    const setLive = rightSidebar?.setTicketCopresenceLive;
    const setViewers = rightSidebar?.setTicketOtherAgentViewers;
    if (!setLive && !setViewers) return;
    setLive?.(copresenceLive);
    setViewers?.(otherAgentViewers);
    return () => {
      setLive?.(false);
      setViewers?.([]);
    };
  }, [
    copresenceLive,
    otherAgentViewers,
    rightSidebar?.setTicketCopresenceLive,
    rightSidebar?.setTicketOtherAgentViewers,
  ]);

  const onMessageSent = useCallback(
    (payload?: TicketMessageSentPayload) => {
      if (payload?.message) {
        queryClient.setQueryData<TicketDetail>(queryKeys.tickets.detail(ticketCacheId), (old) => {
          if (!old) return old;
          if (old.messages.some((m) => m.id === payload.message!.id)) return old;
          let next: TicketDetail = {
            ...old,
            messages: [...old.messages, payload.message!],
            updatedAt: payload.message!.createdAt || old.updatedAt,
          };
          if (payload.ticketStatus) {
            next = { ...next, status: payload.ticketStatus.toLowerCase() };
          }
          if (payload.isFirstResponse && payload.message?.createdAt) {
            next = { ...next, firstResponseAt: payload.message.createdAt };
          }
          return next;
        });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketCacheId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.activities(ticketCacheId) });
    },
    [queryClient, ticketCacheId]
  );

  // Warm activities cache as soon as the route is open so "Show activities" renders immediately.
  useEffect(() => {
    if (ticketCacheId === "") return;
    const idNum = Number(ticketCacheId);
    if (!Number.isFinite(idNum)) return;
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.activities(ticketCacheId),
      queryFn: () => fetchTicketActivities(idNum),
      staleTime: TICKET_ACTIVITIES_STALE_MS,
      retry: false,
    });
  }, [ticketCacheId, queryClient]);

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

  // Baseline + chip: first visit writes sessionStorage immediately; later runs only show "N update(s)" when inbound
  // (customer / merchant / rider) messages increase — not when ticket.updatedAt changes from spam, status, agent edits, etc.
  useEffect(() => {
    if (!ticket) return;
    const stored = getStoredLastViewed(ticket.id);
    if (!stored) {
      setStoredLastViewed(ticket.id, ticket);
      setNewUpdatesCount(0);
      return;
    }
    if (stored.inboundCount < 0) {
      setStoredLastViewed(ticket.id, ticket);
      setNewUpdatesCount(0);
      return;
    }
    const currentInbound = countInboundUserMessages(ticket.messages ?? []);
    const delta = currentInbound - stored.inboundCount;
    setNewUpdatesCount(delta > 0 ? Math.min(delta, 99) : 0);
  }, [ticket?.id, ticket?.messages, ticket]);

  // Auto-refresh exactly when snooze expires so status/button/chips flip without manual reload.
  useEffect(() => {
    if (!ticket || ticket.status !== "snoozed" || !ticket.snoozedUntil) return;
    const endMs = new Date(ticket.snoozedUntil).getTime();
    if (!Number.isFinite(endMs)) return;
    const delayMs = Math.max(0, endMs - Date.now() + 400);
    const timeoutId = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketCacheId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.helpdeskDashboard() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.activities(ticketCacheId) });
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [ticket?.id, ticket?.status, ticket?.snoozedUntil, queryClient, ticketCacheId]);

  const handleDismissUpdates = useCallback(() => {
    if (!ticket) return;
    setStoredLastViewed(ticket.id, ticket);
    setNewUpdatesCount(0);
  }, [ticket]);

  /** No ticket yet and query hasn't failed — light skeleton only (never GM spinner). */
  const stillLoading = !ticket && !isError && isPending;
  const raisedType = String(ticket?.sourceRole || ticket?.ticketSource || "").toUpperCase();
  const contactLabel = raisedType === "RIDER" ? "Rider" : raisedType === "CUSTOMER" ? "Customer" : raisedType === "MERCHANT" ? "Merchant" : null;
  const corporateFields = useMemo(
    () => parseCorporateEnquiryFromDescription(ticket?.description),
    [ticket?.description]
  );
  const isCorporateTicket = useMemo(
    () =>
      isCorporateEnquiryTicket(
        ticket?.subject ?? "",
        ticket?.description ?? "",
        ticket?.title?.titleText ?? null
      ),
    [ticket?.subject, ticket?.description, ticket?.title?.titleText]
  );
  const showCorporateContact =
    isCorporateTicket &&
    Boolean(corporateFields.corporateEntityName?.trim() || corporateFields.corporateEntityPhone?.trim());
  const showContactName =
    !showCorporateContact &&
    contactLabel != null &&
    ticket?.raisedByName &&
    ticket.raisedByName.trim() !== "";
  const showContactPhone =
    !showCorporateContact &&
    contactLabel != null &&
    ticket?.raisedByMobile &&
    ticket.raisedByMobile.trim() !== "";
  const defaultReplyToOverride = useMemo(() => {
    if (!isSystemOtherTicketGroup(ticket?.group ?? undefined)) return null;
    const em = corporateFields.corporateEntityEmail?.trim();
    if (!em || !em.includes("@")) return null;
    return em;
  }, [ticket?.group, corporateFields.corporateEntityEmail]);

  useEffect(() => {
    if (!rightSidebar?.setOpen) return;
    if (stillLoading) {
      if (sidebarStateBeforeLoadingRef.current == null) {
        sidebarStateBeforeLoadingRef.current = Boolean(rightSidebar.isOpen);
      }
      rightSidebar.setOpen(false);
      return;
    }
    if (sidebarStateBeforeLoadingRef.current != null) {
      rightSidebar.setOpen(sidebarStateBeforeLoadingRef.current);
      sidebarStateBeforeLoadingRef.current = null;
    }
  }, [stillLoading, rightSidebar]);

  if (stillLoading) {
    return <TicketDetailLoadingShell />;
  }

  if (isError || (error && !ticket)) {
    return (
      <div className="flex h-full min-h-[70vh] items-center justify-center px-6 text-center">
        <div className="max-w-md text-gray-800">
          <p className="text-lg font-semibold tracking-tight">😒 Oho Nooo......</p>
          <p className="mt-3 text-base font-normal text-gray-600">You took a wrong turn!</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return <TicketDetailLoadingShell />;
  }

  const getPhoneLastTenDigits = (phone: string | null): string => {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    if (digits.length <= 10) return digits;
    return digits.slice(-10);
  };
  const handleCopyPhone = async () => {
    const rawPhone = showCorporateContact ? corporateFields.corporateEntityPhone : ticket.raisedByMobile;
    const value = getPhoneLastTenDigits(rawPhone ?? null);
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedPhone(true);
      window.setTimeout(() => setCopiedPhone(false), 1500);
    } catch {
      setCopiedPhone(false);
    }
  };
  const handleDownloadAttachment = async (url: string, fileName?: string) => {
    if (!url || url === "#") return;
    try {
      const extFromName =
        fileName && fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";
      const extFromUrl = !extFromName
        ? (() => {
            try {
              const clean = url.split("?")[0].split("#")[0];
              const p = clean.split(".").pop();
              return p ? `.${p}` : "";
            } catch {
              return "";
            }
          })()
        : "";
      const finalName = `GMitra - # ${ticket.ticketNumber || ticket.id}${extFromName || extFromUrl}`;
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const isTicketSettingsMain = rightSidebar?.ticketRightSidebarPanel === "settings";

  if (isTicketSettingsMain) {
    return (
      <div
        className={`relative flex h-full min-h-0 flex-col bg-[#f5f7f9] transition-[padding] duration-200 ${
          rightSidebar?.isOpen ? "lg:pr-64" : "lg:pr-14"
        }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto min-w-0 max-w-5xl px-4 py-5 sm:px-6">
            <header className="border-b border-gray-200 pb-4">
              <h1 className="text-lg font-semibold text-gray-900">Activity & reports</h1>
              <p className="mt-1 text-sm text-gray-600">
                Performance metrics, CSAT/DSAT, and time tracking for the selected period.
              </p>
            </header>
            <div className="pt-6">
              <AgentActivityPageClient embed="ticketSettingsActivity" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col bg-[#f5f7f9] transition-[padding] duration-200 ${
        rightSidebar?.isOpen ? "lg:pr-64" : "lg:pr-14"
      }`}
    >
      <div className="ml-0 mr-0 mt-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-lg rounded-bl-lg border border-gray-200 bg-white">
        {/* Sticky: action bar + ticket heading inside one unified surface */}
        <div className="sticky top-0 z-10 shrink-0 bg-white px-2.5 pt-1 pb-1.5 sm:px-3">
          <TicketActionBar
            ticketId={ticket.id}
            ticketNumber={ticket.ticketNumber || String(ticket.id)}
            mergedTickets={ticket.mergedTickets ?? []}
            mergedIntoTicketId={ticket.mergedIntoTicketId ?? null}
            mergedIntoTicketNumber={ticket.mergedIntoTicketNumber ?? null}
            showActivities={showActivities}
            onToggleActivities={() => {
              if (showActivities) setTicketPanel("conversation");
              else setTicketPanel("activities");
            }}
            showCsat={showCsatPanel}
            onToggleCsat={() => {
              if (showCsatPanel) setTicketPanel("conversation");
              else setTicketPanel("csat");
            }}
            onReplyClick={() => {
              setQuickComposeAction({ type: "reply", nonce: Date.now() });
              setShowReplySection(true);
            }}
            onForwardClick={() => {
              setQuickComposeAction({ type: "forward", nonce: Date.now() });
              setShowReplySection(true);
            }}
            onAddNoteClick={(visibility) => {
              setQuickComposeAction({
                type: visibility === "public" ? "note_public" : "note_private",
                nonce: Date.now(),
              });
              setShowReplySection(true);
            }}
            onMergeSuccess={onMessageSent}
            ticketIsSpam={ticket.isSpam === true}
            ticketStatus={ticket.status}
            snoozedUntil={ticket.snoozedUntil}
          />
          <div className="mt-0 border-t border-gray-200 px-0.5 pb-1.5 pt-1">
            <TicketHeader
              ticket={ticket}
              newUpdatesCount={newUpdatesCount}
              onDismissUpdates={handleDismissUpdates}
              variant="subjectOnly"
            />
          </div>
        </div>

        {/* Scrollable: description+attachments, conversation. (Main window is locked; only this pane scrolls) */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white px-2.5 pb-4 sm:px-3">
          {showActivities ? (
            <div className="mt-0 px-0">
              <ActivityTimeline ticketId={ticket.id} noScroll ticketCreatedAt={ticket.createdAt} messages={ticket.messages ?? []} />
            </div>
          ) : showCsatPanel ? (
            <div className="mt-0 px-0">
              <TicketCsatPanel
                ticketId={ticket.id}
                ticketNumber={ticket.ticketNumber || String(ticket.id)}
                satisfactionRating={ticket.satisfactionRating}
                satisfactionFeedback={ticket.satisfactionFeedback}
                satisfactionCollectedAt={ticket.satisfactionCollectedAt}
                ticketRatings={ticket.ticketRatings}
              />
            </div>
          ) : (
            <>
              <div className="px-0.5 pt-1">
                <TicketHeader
                  ticket={ticket}
                  newUpdatesCount={newUpdatesCount}
                  onDismissUpdates={handleDismissUpdates}
                  variant="metaOnly"
                />
              </div>
              {/* Description area now integrated into same surface (no extra detached card). */}
              {(ticket.description || (ticket.attachments && ticket.attachments.length > 0)) && (
                <div className="mt-2 border-b border-gray-200 pb-3.5">
                  {ticket.description && (
                    <>
                      <div className="flex gap-2.5">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-gray-200 text-xs font-semibold text-gray-700">
                          {(ticket.raisedByName || ticket.sourceRole || "R").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] leading-5">
                            <span className="font-medium text-[#2563eb]">{ticket.raisedByName || ticket.sourceRole || "Customer"}</span>
                            <span className="text-[#374151]"> reported via the portal</span>
                          </div>
                          <div className="mt-0.5 text-[11px] italic text-gray-500">
                            {formatCreatedLong(ticket.createdAt)}
                          </div>
                          <div className="mt-2.5 grid grid-cols-[14px_minmax(0,1fr)] items-start gap-x-2 gap-y-2">
                            <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
                            <span className="block max-w-[920px] break-words text-[13px] leading-snug text-[#374151]">
                              {ticket.description}
                            </span>
                            {showCorporateContact && (
                              <>
                                {corporateFields.corporateEntityName?.trim() ? (
                                  <>
                                    <span aria-hidden className="h-3.5 w-3.5" />
                                    <p className="mt-2 text-sm font-semibold text-[#1f2937]">
                                      Corporate Entity Name: {corporateFields.corporateEntityName.trim()}
                                    </p>
                                  </>
                                ) : null}
                                {corporateFields.corporateEntityPhone?.trim() ? (
                                  <>
                                    <span aria-hidden className="h-3.5 w-3.5" />
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold text-[#1f2937]">
                                        Corporate Entity Phone: {corporateFields.corporateEntityPhone.trim()}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => void handleCopyPhone()}
                                        className="inline-flex cursor-pointer items-center gap-0.5 px-0.5 text-[10px] font-medium text-gray-700 hover:text-gray-900"
                                        aria-label="Copy last 10 digits"
                                        title="Copy 10-digit number"
                                      >
                                        {copiedPhone ? <Check className="h-2.5 w-2.5 text-green-600" /> : <Copy className="h-2.5 w-2.5" />}
                                        {copiedPhone ? "Copied" : ""}
                                      </button>
                                    </div>
                                  </>
                                ) : null}
                              </>
                            )}
                            {showContactName && (
                              <>
                                <span aria-hidden className="h-3.5 w-3.5" />
                                <p className="mt-2 text-sm font-semibold text-[#1f2937]">
                                  {contactLabel} Name: {ticket.raisedByName}
                                </p>
                              </>
                            )}
                            {showContactPhone && (
                              <>
                                <span aria-hidden className="h-3.5 w-3.5" />
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-[#1f2937]">
                                    {contactLabel} Phone: {ticket.raisedByMobile}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => void handleCopyPhone()}
                                    className="inline-flex cursor-pointer items-center gap-0.5 px-0.5 text-[10px] font-medium text-gray-700 hover:text-gray-900"
                                    aria-label="Copy last 10 digits"
                                    title="Copy 10-digit number"
                                  >
                                    {copiedPhone ? <Check className="h-2.5 w-2.5 text-green-600" /> : <Copy className="h-2.5 w-2.5" />}
                                    {copiedPhone ? "Copied" : ""}
                                  </button>
                                </div>
                              </>
                            )}
                            {ticket.attachments && ticket.attachments.length > 0 && (
                              <>
                                <span aria-hidden className="h-3.5 w-3.5" />
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  {ticket.attachments.map((att, i) => {
                                    const { url, name, mimeType } = attachmentRowMeta(
                                      att as string | { url?: string; name?: string; mimeType?: string; mime_type?: string }
                                    );
                                    const isImage = isHeaderAttachmentImage(url, name, mimeType);
                                    return (
                                      <div
                                        key={i}
                                        className="relative inline-flex min-w-[150px] max-w-[170px] items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 pr-8 text-left shadow-sm"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (url && url !== "#") {
                                              window.open(url, "_blank", "noopener,noreferrer");
                                            }
                                          }}
                                          className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                                          title={name || (isImage ? "Open image in new tab" : "View file")}
                                        >
                                          {isImage ? (
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100">
                                              <img src={url} alt="" className="h-full w-full object-cover" />
                                            </span>
                                          ) : (
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100">
                                              <Paperclip className="h-3.5 w-3.5 text-gray-500" />
                                            </span>
                                          )}
                                          <span className="min-w-0">
                                            <span className="block truncate text-xs font-semibold text-gray-700">{name || "File"}</span>
                                            <span className="block text-[10px] text-gray-500">{isImage ? "Image attachment" : "File attachment"}</span>
                                          </span>
                                        </button>
                                        {url && url !== "#" && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleDownloadAttachment(url, name || undefined);
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex cursor-pointer items-center justify-center text-gray-500 hover:text-gray-700"
                                            aria-label="Download attachment"
                                            title="Download"
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {ticket.attachments && ticket.attachments.length > 0 && !ticket.description && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {ticket.attachments.map((att, i) => {
                          const { url, name, mimeType } = attachmentRowMeta(
                            att as string | { url?: string; name?: string; mimeType?: string; mime_type?: string }
                          );
                          const isImage = isHeaderAttachmentImage(url, name, mimeType);
                          return (
                            <div
                              key={i}
                              className="relative inline-flex min-w-[150px] max-w-[170px] items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 pr-8 text-left shadow-sm"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (url && url !== "#") {
                                    window.open(url, "_blank", "noopener,noreferrer");
                                  }
                                }}
                                className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                                title={name || (isImage ? "Open image in new tab" : "View file")}
                              >
                                {isImage ? (
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100">
                                    <img src={url} alt="" className="h-full w-full object-cover" />
                                  </span>
                                ) : (
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100">
                                    <Paperclip className="h-3.5 w-3.5 text-gray-500" />
                                  </span>
                                )}
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-semibold text-gray-700">{name || "File"}</span>
                                  <span className="block text-[10px] text-gray-500">{isImage ? "Image attachment" : "File attachment"}</span>
                                </span>
                              </button>
                              {url && url !== "#" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDownloadAttachment(url, name || undefined);
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex cursor-pointer items-center justify-center text-gray-500 hover:text-gray-700"
                                  aria-label="Download attachment"
                                  title="Download"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-0">
                <ConversationPanel
                  ticketId={ticket.id}
                  ticketNumber={ticket.ticketNumber}
                  ticketSubject={ticket.subject}
                  ticketStatus={ticket.status}
                  snoozedUntil={ticket.snoozedUntil ?? null}
                  messages={ticket.messages || []}
                  recipientEmail={ticket.raisedByEmail ?? undefined}
                  defaultReplyToOverride={defaultReplyToOverride}
                  onMessageSent={onMessageSent}
                  replyVisible={showReplySection}
                  quickComposeAction={quickComposeAction}
                  onOpenReply={() => setShowReplySection(true)}
                  onCloseReply={() => setShowReplySection(false)}
                  noScroll
                  embedded
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


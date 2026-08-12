"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Reply,
  StickyNote,
  Forward,
  GitMerge,
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PanelRight,
  Globe,
  Lock,
  Check,
  Search,
  Plus,
  X,
  Star,
  Ban,
  AlertTriangle,
  AlarmClock,
  Play,
  Loader2,
} from "lucide-react";
import { useRightSidebar } from "@/context/RightSidebarContext";
import { useToast } from "@/context/ToastContext";
import { useTicketUpdate } from "@/hooks/tickets/useTicketUpdate";
import { useTicketLocationSearch } from "@/hooks/tickets/useTicketUrlPanel";
import {
  buildTicketDetailHref,
  buildTicketsListHrefPreservingFilters,
  ticketDetailHasQueueContext,
} from "@/lib/tickets/ticket-path-utils";
import { useTicketsNavPending } from "@/context/TicketsNavPendingContext";
import { useCurrentRoute } from "@/context/CurrentRouteContext";
import { useTicketDashboardAccess } from "@/hooks/useTicketDashboardAccess";
import { queryKeys } from "@/lib/queryKeys";
import { sanitizeTicketDisplayText } from "@/lib/tickets/ticket-display-subject";

type MergeCandidate = {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  parentTicketId: number | null;
  isSameAsPrimary: boolean;
  isAlreadyMerged: boolean;
};

interface TicketActionBarProps {
  ticketId: number;
  ticketNumber: string;
  orderId?: number | null;
  orderFormattedId?: string | null;
  mergedTickets?: Array<{ id: number; ticketNumber: string; status: string | null }>;
  mergedIntoTicketId?: number | null;
  mergedIntoTicketNumber?: string | null;
  showActivities: boolean;
  onToggleActivities: () => void;
  showCsat: boolean;
  onToggleCsat: () => void;
  onReplyClick?: () => void;
  onForwardClick?: () => void;
  onAddNoteClick?: (visibility: "private" | "public") => void;
  onMergeSuccess?: () => void;
  /** When true, ticket was marked as spam (persists if status changes). */
  ticketIsSpam?: boolean;
  ticketStatus?: string | null;
  snoozedUntil?: string | null;
}

export function TicketActionBar({
  ticketId,
  ticketNumber,
  orderId: _orderIdProp = null,
  orderFormattedId = null,
  mergedTickets = [],
  mergedIntoTicketId = null,
  mergedIntoTicketNumber = null,
  showActivities,
  onToggleActivities,
  showCsat,
  onToggleCsat,
  onReplyClick,
  onForwardClick,
  onAddNoteClick,
  onMergeSuccess,
  ticketIsSpam = false,
  ticketStatus = null,
  snoozedUntil = null,
}: TicketActionBarProps) {
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [selectedNoteVisibility, setSelectedNoteVisibility] = useState<"private" | "public">("private");
  const [mergeLinkedOpen, setMergeLinkedOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeSearchLoading, setMergeSearchLoading] = useState(false);
  const [mergeSearchResults, setMergeSearchResults] = useState<MergeCandidate[]>([]);
  const [selectedMergeTickets, setSelectedMergeTickets] = useState<MergeCandidate[]>([]);
  const [mergeReason, setMergeReason] = useState("");
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  const [spamConfirmOpen, setSpamConfirmOpen] = useState(false);
  const [isNavLoading, setIsNavLoading] = useState<"prev" | "next" | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeCustomOpen, setSnoozeCustomOpen] = useState(false);
  const [snoozeReason, setSnoozeReason] = useState("");
  const [snoozeAt, setSnoozeAt] = useState("");
  const [snoozeSubmitting, setSnoozeSubmitting] = useState(false);
  /** Which snooze control is awaiting the API (duration label, or "custom" for datetime confirm). */
  const [snoozePendingKey, setSnoozePendingKey] = useState<string | null>(null);
  const addNoteRef = useRef<HTMLDivElement>(null);
  const mergeRef = useRef<HTMLDivElement>(null);
  const snoozeRef = useRef<HTMLDivElement>(null);
  const rightSidebar = useRightSidebar();
  const router = useRouter();
  const locationSearch = useTicketLocationSearch();
  const { clearPendingNav } = useTicketsNavPending();
  const currentRoute = useCurrentRoute();
  const fromQueue = useMemo(() => ticketDetailHasQueueContext(locationSearch), [locationSearch]);
  const allTicketsHref = useMemo(
    () => buildTicketsListHrefPreservingFilters(locationSearch),
    [locationSearch]
  );
  const goToTicketList = () => {
    clearPendingNav();
    currentRoute?.clearNavigation();
    router.push(allTicketsHref, { scroll: false });
  };
  const pushTicketPreservingListContext = (id: number) => {
    router.push(buildTicketDetailHref(id, locationSearch), { scroll: false });
  };
  const { toast } = useToast();
  const markSpamMutation = useTicketUpdate();
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addNoteRef.current && !addNoteRef.current.contains(e.target as Node)) {
        setAddNoteOpen(false);
      }
      if (mergeRef.current && !mergeRef.current.contains(e.target as Node)) {
        setMergeLinkedOpen(false);
      }
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setSnoozeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const scrollToReplyComposer = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.hash !== "#reply") {
      url.hash = "reply";
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    requestAnimationFrame(() => {
      document.getElementById("reply")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const handleReply = () => {
    onReplyClick?.();
    scrollToReplyComposer();
  };

  const handleForward = () => {
    onForwardClick?.();
    scrollToReplyComposer();
  };

  const findAdjacentTicketId = async (direction: "prev" | "next"): Promise<number | null> => {
    const start = Number(ticketId);
    if (!Number.isFinite(start)) return null;
    const step = direction === "next" ? 1 : -1;
    let candidate = start + step;
    let attempts = 0;
    while (candidate > 0 && attempts < 400) {
      try {
        const res = await fetch(`/api/tickets/${candidate}`, { credentials: "include" });
        if (res.ok) return candidate;
      } catch {}
      candidate += step;
      attempts += 1;
    }
    return null;
  };

  const handleAdjacentOpen = async (direction: "prev" | "next") => {
    if (isNavLoading) return;
    setIsNavLoading(direction);
    try {
      const adjacentId = await findAdjacentTicketId(direction);
      if (adjacentId != null) {
        pushTicketPreservingListContext(adjacentId);
      }
    } finally {
      setIsNavLoading(null);
    }
  };

  const ticketIdNum = Number(ticketId);
  const mergeCandidatesEnabled = Number.isFinite(ticketIdNum) && ticketIdNum > 0;

  const parsedDuplicateIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedMergeTickets
            .filter((t) => !t.isSameAsPrimary && !t.isAlreadyMerged)
            .map((t) => t.id)
            .filter((id) => id > 0 && id !== ticketIdNum)
        )
      ),
    [selectedMergeTickets, ticketIdNum]
  );

  /** Prefetch while ticket is open so Merge modal opens with data already ready. */
  const mergeCandidatesQuery = useQuery({
    queryKey: queryKeys.tickets.mergeCandidates(mergeCandidatesEnabled ? ticketIdNum : "invalid"),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/tickets/${ticketIdNum}/merge-candidates`, {
        credentials: "include",
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Failed to load related tickets"
        );
      }
      const items = Array.isArray(data?.data) ? data.data : [];
      const mapped: MergeCandidate[] = items
        .map((t: Record<string, unknown>) => {
          const id = Number(t.id);
          return {
            id,
            ticketNumber: String(t.ticketNumber ?? t.ticket_id ?? ""),
            subject: sanitizeTicketDisplayText(String(t.subject ?? "")),
            status: String(t.status ?? "").toUpperCase(),
            parentTicketId: t.parentTicketId != null ? Number(t.parentTicketId) : null,
            isSameAsPrimary: id === ticketIdNum,
            isAlreadyMerged: t.parentTicketId != null,
          };
        })
        .filter((t: MergeCandidate) => Number.isFinite(t.id) && t.id > 0 && Boolean(t.ticketNumber));
      return {
        tickets: mapped,
        orderFormattedId:
          typeof data?.orderFormattedId === "string" ? data.orderFormattedId : null,
        orderId: data?.orderId != null ? Number(data.orderId) : null,
      };
    },
    enabled: mergeCandidatesEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const sameOrderTickets = mergeCandidatesQuery.data?.tickets ?? [];
  /** Only show loading when we have no cached candidates yet. */
  const sameOrderLoading =
    mergeCandidatesEnabled &&
    (mergeCandidatesQuery.isLoading || mergeCandidatesQuery.isFetching) &&
    sameOrderTickets.length === 0;
  const sameOrderOrderLabel =
    mergeCandidatesQuery.data?.orderFormattedId ?? orderFormattedId ?? null;

  useEffect(() => {
    if (!mergeOpen) return;
    const q = mergeQuery.trim();
    if (q.length < 2) {
      setMergeSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setMergeSearchLoading(true);
      try {
        const res = await fetch(`/api/unified-tickets?limit=8&q=${encodeURIComponent(q)}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        const items = Array.isArray(data?.data?.tickets) ? data.data.tickets : [];
        const mapped = items
          .map((t: Record<string, unknown>) => ({
            id: Number(t.id),
            ticketNumber: String(t.ticketId ?? ""),
            subject: sanitizeTicketDisplayText(String(t.subject ?? "")),
            status: String(t.status ?? "").toUpperCase(),
            parentTicketId: t.parentTicketId != null ? Number(t.parentTicketId) : null,
            isSameAsPrimary:
              Number(t.id) === ticketIdNum ||
              String(t.ticketId ?? "").trim().toUpperCase() === String(ticketNumber ?? "").trim().toUpperCase(),
            isAlreadyMerged: t.parentTicketId != null,
          }))
          .filter((t: { id: number; ticketNumber: string }) => Number.isFinite(t.id) && t.ticketNumber);
        setMergeSearchResults(mapped);
      } catch {
        setMergeSearchResults([]);
      } finally {
        setMergeSearchLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mergeOpen, mergeQuery, ticketIdNum, ticketNumber]);

  const addMergeTicket = (ticket: MergeCandidate) => {
    if (ticket.isSameAsPrimary) {
      toast("Primary ticket cannot be merged into itself", "error");
      return;
    }
    if (ticket.isAlreadyMerged) {
      toast("This ticket is already merged", "error");
      return;
    }
    setSelectedMergeTickets((prev) => (prev.some((x) => x.id === ticket.id) ? prev : [...prev, ticket]));
  };

  const removeMergeTicket = (id: number) => {
    setSelectedMergeTickets((prev) => prev.filter((x) => x.id !== id));
  };

  /** Reply / note / forward / merge are unavailable while Activity or C&D-SAT panel is open */
  const { isViewOnly: ticketViewOnly } = useTicketDashboardAccess();
  const composeLocked = showActivities || showCsat || ticketViewOnly;

  const spamMarked = ticketIsSpam === true;
  const spamDisabled =
    composeLocked || spamMarked || mergedIntoTicketId != null || markSpamMutation.isPending;
  const normalizedStatus = String(ticketStatus ?? "").toLowerCase();
  const isSnoozed = normalizedStatus === "snoozed";
  /** Starting a snooze is invalid for terminal states (matches API / product rules). */
  const snoozeStartBlocked =
    normalizedStatus === "resolved" ||
    normalizedStatus === "closed" ||
    normalizedStatus === "provisionally_resolved";

  const openSpamWarning = () => {
    if (spamDisabled) return;
    setSpamConfirmOpen(true);
  };

  const confirmMarkSpam = () => {
    if (spamDisabled || markSpamMutation.isPending) return;
    markSpamMutation.mutate(
      { ticketId, isSpam: true, status: "rejected" },
      {
        onSuccess: () => {
          setSpamConfirmOpen(false);
          toast("Ticket marked as spam");
          onMergeSuccess?.();
        },
        onError: (err) =>
          toast(err instanceof Error ? err.message : "Failed to mark as spam", "error"),
      }
    );
  };

  useEffect(() => {
    if (composeLocked) {
      setAddNoteOpen(false);
      setMergeLinkedOpen(false);
      setSpamConfirmOpen(false);
      setSnoozeOpen(false);
      setSnoozeCustomOpen(false);
    }
  }, [composeLocked]);

  useEffect(() => {
    if (snoozeStartBlocked) {
      setSnoozeOpen(false);
      setSnoozeCustomOpen(false);
    }
  }, [snoozeStartBlocked]);

  const snoozeDurations = useMemo(
    () => [
      { label: "2 min", minutes: 2 },
      { label: "5 min", minutes: 5 },
      { label: "10 min", minutes: 10 },
      { label: "15 min", minutes: 15 },
      { label: "25 min", minutes: 25 },
      { label: "30 min", minutes: 30 },
      { label: "45 min", minutes: 45 },
      { label: "1 hour", minutes: 60 },
      { label: "4 hours", minutes: 240 },
      { label: "Tomorrow", minutes: null },
    ],
    []
  );

  const submitSnooze = async (durationOrDate: number | string, loadingKey?: string | null) => {
    if (snoozeSubmitting) return;
    setSnoozeSubmitting(true);
    if (loadingKey != null) setSnoozePendingKey(loadingKey);
    try {
      const payload: Record<string, unknown> = {
        reason: snoozeReason.trim() || undefined,
      };
      if (typeof durationOrDate === "number") payload.duration = durationOrDate;
      else payload.datetime = durationOrDate;
      const res = await fetch(`/api/tickets/${ticketId}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast(data?.error ?? "Failed to snooze ticket", "error");
        return;
      }
      setSnoozeOpen(false);
      setSnoozeCustomOpen(false);
      setSnoozeAt("");
      toast("Ticket snoozed");
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "tickets" && q.queryKey[1] === "list",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.helpdeskDashboard() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketId) });
      onMergeSuccess?.();
    } catch {
      toast("Failed to snooze ticket", "error");
    } finally {
      setSnoozeSubmitting(false);
      setSnoozePendingKey(null);
    }
  };

  const submitUnsnooze = async () => {
    if (snoozeSubmitting) return;
    setSnoozeSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/unsnooze`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast(data?.error ?? "Failed to resume ticket", "error");
        return;
      }
      toast("Ticket resumed");
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "tickets" && q.queryKey[1] === "list",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.helpdeskDashboard() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketId) });
      onMergeSuccess?.();
    } catch {
      toast("Failed to resume ticket", "error");
    } finally {
      setSnoozeSubmitting(false);
    }
  };

  const handleMergeSubmit = async () => {
    if (parsedDuplicateIds.length < 1) {
      toast("At least one duplicate ticket ID required", "error");
      return;
    }
    setMergeSubmitting(true);
    try {
      const res = await fetch("/api/tickets/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetTicketId: ticketIdNum,
          sourceTicketIds: parsedDuplicateIds,
          reason: mergeReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast(data?.error ?? "Failed to merge tickets", "error");
        return;
      }
      const mergedCount = Number(data?.data?.mergedCount ?? parsedDuplicateIds.length);
      toast(`${mergedCount} ticket${mergedCount === 1 ? "" : "s"} merged into #${ticketNumber || ticketId}`);
      setMergeOpen(false);
      setMergeQuery("");
      setMergeSearchResults([]);
      setSelectedMergeTickets([]);
      setMergeReason("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.mergeCandidates(ticketIdNum) });
      onMergeSuccess?.();
    } catch {
      toast("Failed to merge tickets", "error");
    } finally {
      setMergeSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-0.5">
      {!ticketViewOnly ? (
      <>
      {/* Reply: shows reply section and scrolls to it */}
      <button
        type="button"
        onClick={() => {
          if (composeLocked) return;
          handleReply();
        }}
        className={`inline-flex h-7.5 items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 text-[12px] font-medium text-gray-700 ${
          composeLocked ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50"
        }`}
        aria-disabled={composeLocked}
      >
        <Reply className="h-3.5 w-3.5" />
        Reply
      </button>

      <div className="relative inline-flex" ref={addNoteRef}>
        <button
          type="button"
          onClick={() => {
            if (composeLocked) return;
            onAddNoteClick?.("private");
          }}
          className={`inline-flex h-7.5 items-center gap-1 rounded-l-md border border-r-0 border-gray-300 bg-white px-2.5 text-[12px] font-medium text-gray-700 ${
            composeLocked ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50"
          }`}
          aria-disabled={composeLocked}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Note
        </button>
        <button
          type="button"
          onClick={() => {
            if (composeLocked) return;
            setAddNoteOpen((v) => !v);
          }}
          className={`inline-flex h-7.5 w-7.5 items-center justify-center rounded-r-md border border-gray-300 bg-white text-gray-600 ${
            composeLocked ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50"
          }`}
          aria-label="Add note: public or private"
          aria-expanded={addNoteOpen}
          aria-disabled={composeLocked}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {addNoteOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-gray-200 bg-white p-1.5 shadow-[0_6px_24px_rgba(15,23,42,0.12)]">
            <p className="px-2 pb-1 text-[12px] font-medium text-gray-500">Mark note as</p>
            <button
              type="button"
              onClick={() => {
                setAddNoteOpen(false);
                setSelectedNoteVisibility("public");
                onAddNoteClick?.("public");
              }}
              className={`flex w-full items-start justify-between rounded-md px-2 py-1.5 text-left ${
                selectedNoteVisibility === "public" ? "bg-[#eaf3ff] text-[#1d4ed8]" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="flex items-start gap-2">
                <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="block text-[12px] font-medium leading-4">Public</span>
                  <span className="mt-0.5 block text-[11px] leading-3.5 text-gray-500">Visible to contact</span>
                </span>
              </span>
              {selectedNoteVisibility === "public" ? <Check className="mt-0.5 h-3.5 w-3.5" /> : null}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddNoteOpen(false);
                setSelectedNoteVisibility("private");
                onAddNoteClick?.("private");
              }}
              className={`mt-1 flex w-full items-start justify-between rounded-md px-2 py-1.5 text-left ${
                selectedNoteVisibility === "private" ? "bg-[#eaf3ff] text-[#1d4ed8]" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="block text-[12px] font-medium leading-4">Private</span>
                  <span className="mt-0.5 block text-[11px] leading-3.5 text-gray-500">Private</span>
                </span>
              </span>
              {selectedNoteVisibility === "private" ? <Check className="mt-0.5 h-3.5 w-3.5" /> : null}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          if (composeLocked) return;
          handleForward();
        }}
        className={`inline-flex h-7.5 items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 text-[12px] font-medium text-gray-700 ${
          composeLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-gray-50"
        }`}
        aria-disabled={composeLocked}
      >
        <Forward className="h-3.5 w-3.5" />
        Forward
      </button>
      <div className="relative inline-flex" ref={mergeRef}>
        {mergedIntoTicketId != null ? (
          <>
            <button
              type="button"
              onClick={() => {
                pushTicketPreservingListContext(mergedIntoTicketId);
                setMergeLinkedOpen(false);
              }}
              className="inline-flex h-7.5 items-center gap-1 rounded-l-md border border-r-0 border-gray-300 bg-white px-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
              title="Open primary ticket"
            >
              <GitMerge className="h-3.5 w-3.5" />
              Merged
              <span className="ml-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">1</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (composeLocked) return;
                setMergeLinkedOpen((v) => !v);
              }}
              className={`inline-flex h-7.5 w-7.5 items-center justify-center rounded-r-md border border-gray-300 bg-white text-gray-600 ${
                composeLocked ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50"
              }`}
              aria-label="Show primary ticket this ticket merged into"
              aria-expanded={mergeLinkedOpen}
              title="Merged linked tickets"
              aria-disabled={composeLocked}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {mergeLinkedOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[260px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <p className="px-3 py-1 text-[11px] font-medium text-gray-500">Merged linked tickets</p>
                <button
                  type="button"
                  onClick={() => {
                    setMergeLinkedOpen(false);
                    pushTicketPreservingListContext(mergedIntoTicketId);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50"
                >
                  <span className="text-xs font-medium text-gray-700">
                    #{mergedIntoTicketNumber || mergedIntoTicketId}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    PRIMARY
                  </span>
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                if (composeLocked) return;
                setSelectedMergeTickets([]);
                setMergeQuery("");
                setMergeSearchResults([]);
                setMergeReason("");
                setMergeOpen(true);
              }}
              className={`inline-flex h-7.5 items-center gap-1 border border-gray-300 bg-white px-2.5 text-[12px] font-medium text-gray-700 ${
                composeLocked ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50"
              } ${mergedTickets.length > 0 ? "rounded-l-md border-r-0" : "rounded-md"}`}
              aria-disabled={composeLocked}
            >
              <GitMerge className="h-3.5 w-3.5" />
              Merge
              {mergedTickets.length > 0 ? (
                <span className="ml-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                  {mergedTickets.length}
                </span>
              ) : null}
            </button>
            {mergedTickets.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (composeLocked) return;
                  setMergeLinkedOpen((v) => !v);
                }}
                className={`inline-flex h-7.5 w-7.5 items-center justify-center rounded-r-md border border-gray-300 bg-white text-gray-600 ${
                  composeLocked ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50"
                }`}
                aria-label="Show merged linked tickets"
                aria-expanded={mergeLinkedOpen}
                title="Merged linked tickets"
                aria-disabled={composeLocked}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
            {mergeLinkedOpen && mergedTickets.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[240px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <p className="px-3 py-1 text-[11px] font-medium text-gray-500">Merged linked tickets</p>
                {mergedTickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setMergeLinkedOpen(false);
                      pushTicketPreservingListContext(t.id);
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50"
                  >
                    <span className="text-xs font-medium text-gray-700">#{t.ticketNumber}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                      {(t.status ?? "OPEN").toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => openSpamWarning()}
        disabled={spamDisabled}
        className={`inline-flex h-7.5 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium ${
          spamDisabled
            ? "cursor-not-allowed border-red-100 bg-red-50/50 text-red-300"
            : "cursor-pointer border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
        }`}
        aria-disabled={spamDisabled}
        title={spamMarked ? "Already marked as spam" : mergedIntoTicketId != null ? "Open the primary merged ticket to change status" : undefined}
      >
        <Ban className="h-3.5 w-3.5" />
        {markSpamMutation.isPending ? "Marking…" : spamMarked ? "Spammed." : "Mark as spam"}
      </button>
      {isSnoozed ? (
        <button
          type="button"
          onClick={() => void submitUnsnooze()}
          disabled={snoozeSubmitting}
          className="inline-flex h-7.5 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[12px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          title={snoozedUntil ? `Snoozed until ${new Date(snoozedUntil).toLocaleString()}` : "Snoozed"}
        >
          <Play className="h-3.5 w-3.5" />
          {snoozeSubmitting ? "Resuming..." : "Resume"}
        </button>
      ) : (
        <div className="relative" ref={snoozeRef}>
          <button
            type="button"
            onClick={() => {
              if (snoozeStartBlocked) return;
              setSnoozeOpen((v) => !v);
            }}
            disabled={composeLocked || snoozeSubmitting || snoozeStartBlocked}
            title={
              snoozeStartBlocked
                ? "Snooze is not available for resolved or closed tickets"
                : undefined
            }
            className={`inline-flex h-7.5 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium ${
              snoozeStartBlocked
                ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                : "cursor-pointer border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            } disabled:opacity-60`}
            aria-disabled={composeLocked || snoozeSubmitting || snoozeStartBlocked}
          >
            <AlarmClock className="h-3.5 w-3.5" />
            Snooze
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {snoozeOpen && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-64 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
              <div className="mb-2">
                <input
                  type="text"
                  value={snoozeReason}
                  onChange={(e) => setSnoozeReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                <div className="grid grid-cols-4 gap-1.5">
                {snoozeDurations.map((opt) => {
                  const pendingHere = snoozeSubmitting && snoozePendingKey === opt.label;
                  return (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={snoozeSubmitting}
                    className={`flex min-h-10 items-center justify-center rounded-md border px-1.5 py-1.5 text-center text-[11px] font-medium ${
                      pendingHere
                        ? "cursor-wait border-blue-200 bg-blue-50 text-blue-800"
                        : "cursor-pointer border-gray-200 bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    onClick={() => {
                      if (opt.minutes == null) {
                        const t = new Date();
                        t.setDate(t.getDate() + 1);
                        t.setHours(9, 0, 0, 0);
                        void submitSnooze(t.toISOString(), opt.label);
                      } else {
                        void submitSnooze(opt.minutes, opt.label);
                      }
                    }}
                  >
                    <span className="inline-flex items-center justify-center gap-1 leading-tight">
                      {pendingHere ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" aria-hidden />
                      ) : null}
                      {opt.label}
                    </span>
                  </button>
                  );
                })}
                </div>
                <button
                  type="button"
                  className="mt-2 w-full cursor-pointer rounded border border-gray-200 px-2 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                  onClick={() => setSnoozeCustomOpen((v) => !v)}
                >
                  Custom datetime
                </button>
              </div>
              {snoozeCustomOpen && (
                <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                  <input
                    type="datetime-local"
                    value={snoozeAt}
                    onChange={(e) => setSnoozeAt(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={!snoozeAt || snoozeSubmitting}
                    onClick={() => void submitSnooze(new Date(snoozeAt).toISOString(), "custom")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {snoozeSubmitting && snoozePendingKey === "custom" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                    ) : null}
                    Confirm snooze
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </>
      ) : null}
      <div className="flex-1" />

      <button
        type="button"
        onClick={onToggleCsat}
        className={`inline-flex h-7.5 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium ${
          showCsat
            ? "border-[#121212] bg-[#121212] text-white"
            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
        aria-label={"C&D — satisfaction for this ticket only"}
        aria-pressed={showCsat}
      >
        <Star className="h-3.5 w-3.5" />
        C&D
      </button>

      {/* Stats toggle */}
      <button
        type="button"
        onClick={onToggleActivities}
        className={`inline-flex h-7.5 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium ${
          showActivities
            ? "border-[#121212] bg-[#121212] text-white"
            : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        <Activity className="h-3.5 w-3.5" />
        Stats
      </button>

      <button
        type="button"
        onClick={() => void handleAdjacentOpen("prev")}
        disabled={isNavLoading != null}
        className="inline-flex h-7.5 w-7.5 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed"
        aria-label="Previous ticket"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={goToTicketList}
        className="inline-flex h-7.5 max-w-[76px] cursor-pointer items-center rounded-md border border-gray-300 bg-white px-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 sm:max-w-none"
        aria-label={fromQueue ? "Back to queue" : "Back to ticket list"}
        title={fromQueue ? "Queue" : "All"}
      >
        <span className="block truncate">{fromQueue ? "Queue" : "All"}</span>
      </button>
      <button
        type="button"
        onClick={() => void handleAdjacentOpen("next")}
        disabled={isNavLoading != null}
        className="inline-flex h-7.5 w-7.5 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed"
        aria-label="Next ticket"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {rightSidebar && (
        <button
          type="button"
          onClick={rightSidebar.onToggle}
          className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          aria-label={rightSidebar.isOpen ? "Close properties panel" : "Open properties panel"}
          aria-expanded={rightSidebar.isOpen}
          title={rightSidebar.isOpen ? "Hide panel" : "Show panel"}
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
      )}
      {mergeOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-ticket-title"
          onClick={(e) => e.target === e.currentTarget && !mergeSubmitting && setMergeOpen(false)}
        >
          <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="merge-ticket-title" className="text-base font-semibold text-gray-900">Merge duplicate tickets</h2>
            <p className="mt-1 text-sm text-gray-500">
              Primary ticket: <span className="font-medium text-gray-700">#{ticketNumber || ticketId}</span>
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Same order tickets
                  {sameOrderOrderLabel ? (
                    <span className="ml-1 font-normal text-gray-500">(Order #{sameOrderOrderLabel})</span>
                  ) : null}
                </label>
                {sameOrderLoading ? (
                  <p className="px-1 py-2 text-xs text-gray-500">Loading related tickets...</p>
                ) : sameOrderTickets.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/60 p-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {sameOrderTickets.map((t) => (
                      <label
                        key={t.id}
                        className={`flex items-start gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2.5 ${
                          t.isSameAsPrimary || t.isAlreadyMerged
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer hover:border-blue-200 hover:bg-blue-50/30"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={
                            t.isSameAsPrimary || selectedMergeTickets.some((x) => x.id === t.id)
                          }
                          disabled={t.isSameAsPrimary || t.isAlreadyMerged}
                          onChange={(e) => {
                            if (t.isSameAsPrimary || t.isAlreadyMerged) return;
                            if (e.target.checked) addMergeTicket(t);
                            else removeMergeTicket(t.id);
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-gray-800">
                            #{t.ticketNumber}
                            <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              {t.status || "OPEN"}
                            </span>
                            {t.isAlreadyMerged ? (
                              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                MERGED
                              </span>
                            ) : null}
                            {t.isSameAsPrimary ? (
                              <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                PRIMARY
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-[11px] text-gray-500">
                            {t.subject || "No subject"}
                          </span>
                        </span>
                      </label>
                    ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Search other duplicates</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={mergeQuery}
                    onChange={(e) => setMergeQuery(e.target.value)}
                    placeholder="Search by ticket ID or subject"
                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {(mergeSearchLoading || mergeSearchResults.length > 0) && (
                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                    {mergeSearchLoading ? (
                      <p className="px-3 py-2 text-xs text-gray-500">Searching...</p>
                    ) : (
                      mergeSearchResults.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => addMergeTicket(t)}
                          disabled={t.isSameAsPrimary || t.isAlreadyMerged}
                          className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left ${
                            t.isSameAsPrimary || t.isAlreadyMerged
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-gray-50"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-gray-800">
                              #{t.ticketNumber}
                              <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                {t.status || "OPEN"}
                              </span>
                              {t.isAlreadyMerged ? (
                                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                  MERGED
                                </span>
                              ) : null}
                              {t.isSameAsPrimary ? (
                                <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                  PRIMARY
                                </span>
                              ) : null}
                            </span>
                            <span className="block truncate text-[11px] text-gray-500">{t.subject || "No subject"}</span>
                          </span>
                          <Plus className={`mt-0.5 h-3.5 w-3.5 ${t.isSameAsPrimary || t.isAlreadyMerged ? "text-gray-400" : "text-blue-600"}`} />
                        </button>
                      ))
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedMergeTickets.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] text-blue-700">
                      #{t.ticketNumber}
                      <span className="rounded bg-white/80 px-1 text-[10px] font-medium text-blue-700">{t.status || "OPEN"}</span>
                      <button
                        type="button"
                        onClick={() => removeMergeTicket(t.id)}
                        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-blue-100"
                        aria-label={`Remove ${t.ticketNumber}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  Select one or more duplicate tickets. Selected: {parsedDuplicateIds.length}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Reason (optional)</label>
                <input
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  placeholder="Why these tickets are duplicates"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMergeOpen(false)}
                disabled={mergeSubmitting}
                className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleMergeSubmit()}
                disabled={mergeSubmitting || parsedDuplicateIds.length < 1}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {mergeSubmitting ? "Merging..." : "Merge tickets"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {spamConfirmOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mark-spam-desc"
          onClick={(e) => e.target === e.currentTarget && !markSpamMutation.isPending && setSpamConfirmOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p id="mark-spam-desc" className="text-sm text-gray-700">
                  Ticket #{ticketNumber || ticketId} Will be rejected as spam, removed from the active queue, and cannot be undone..
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => !markSpamMutation.isPending && setSpamConfirmOpen(false)}
                disabled={markSpamMutation.isPending}
                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmMarkSpam()}
                disabled={markSpamMutation.isPending}
                className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {markSpamMutation.isPending ? "Marking…" : "Yes, mark as spam"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, ChevronRight, ChevronLeft, CheckCircle2, Headphones, Search } from "lucide-react";
import { useMerchantSession, type MerchantSessionContextValue } from "@/context/MerchantSessionContext";
import {
  MX_OPEN_NEED_HELP_EVENT,
  type MxNeedHelpOpenDetail,
} from "@/lib/openMxNeedHelp";

const SESSION_OUTSIDE_PROVIDER: MerchantSessionContextValue = {
  user: null,
  sessionStatus: null,
  parent: null,
  isLoading: true,
  isRefreshing: false,
  isAuthenticated: false,
  logout: async () => {},
  refetch: () => {},
};

const ORDER_PICK_PAGE_SIZE = 5;
const HELP_SECTIONS_CACHE_KEY = "mx_help_sections_cache_v1";
const HELP_SECTIONS_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12h

type HelpSection = {
  ticket_title_id: number;
  parent_title_id: number | null;
  section_id: string;
  title: string;
  subtitle: string | null;
  quick_options: string[];
  display_order: number | null;
  help_hub_icon: string | null;
};

type SheetStep = "topics" | "options" | "orderPick" | "compose" | "success";

type CreatedTicketSummary = { id: number; ticket_id: string };

type PendingTicketDraft = {
  ticketTitleId: number;
  subject: string;
  description: string;
};

type OrderPickRow = {
  id: number;
  order_id: number;
  formatted_order_id?: string | null;
  customer_name?: string | null;
  order_status?: string | null;
  created_at: string;
  grand_total?: number | string | null;
};

function readSelectedStoreId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("selectedStoreId")?.trim() || "";
}

const NeedHelpBadge: React.FC<{
  inline?: boolean;
  variant?: "pill" | "headerLink";
  className?: string;
}> = ({ inline = false, variant = "pill", className }) => {
  const router = useRouter();
  const session = useMerchantSession() ?? SESSION_OUTSIDE_PROVIDER;
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<HelpSection[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [sectionsError, setSectionsError] = useState(false);
  const [sheetStep, setSheetStep] = useState<SheetStep>("topics");
  const [selectedTopic, setSelectedTopic] = useState<HelpSection | null>(null);
  const [composeText, setComposeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [createdTicket, setCreatedTicket] = useState<CreatedTicketSummary | null>(null);
  const [orderHelpContext, setOrderHelpContext] = useState<MxNeedHelpOpenDetail | null>(null);
  const [pendingTicket, setPendingTicket] = useState<PendingTicketDraft | null>(null);
  const [orderPickRows, setOrderPickRows] = useState<OrderPickRow[]>([]);
  const [orderPickSearch, setOrderPickSearch] = useState("");
  const [orderPickVisibleCount, setOrderPickVisibleCount] = useState(ORDER_PICK_PAGE_SIZE);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const selectedStoreId = readSelectedStoreId();

  const readCachedSections = useCallback((): HelpSection[] | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(HELP_SECTIONS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts?: unknown; sections?: unknown };
      const ts = typeof parsed.ts === "number" ? parsed.ts : 0;
      if (!ts || Date.now() - ts > HELP_SECTIONS_CACHE_TTL_MS) return null;
      if (!Array.isArray(parsed.sections)) return null;
      return parsed.sections as HelpSection[];
    } catch {
      return null;
    }
  }, []);

  const writeCachedSections = useCallback((next: HelpSection[]) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(HELP_SECTIONS_CACHE_KEY, JSON.stringify({ ts: Date.now(), sections: next }));
    } catch {
      /* ignore */
    }
  }, []);

  const loadSections = useCallback(
    async ({ force = false, background = false }: { force?: boolean; background?: boolean } = {}) => {
      // If we already have topics, keep UI responsive and refresh in background.
      if (!force) {
        const cached = readCachedSections();
        if (cached && cached.length > 0) {
          setSections((prev) => (prev.length > 0 ? prev : cached));
          if (background) return; // caller only wanted instant data
        }
      }

      const shouldShowSpinner = !background && sections.length === 0;
      if (shouldShowSpinner) setLoadingSections(true);
      setSectionsError(false);
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      try {
        const res = await fetch("/api/merchant/help-sections", {
          signal: controller?.signal,
          // Avoid long-lived caches; we manage our own cache above.
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          if (sections.length === 0) {
            setSections([]);
            setSectionsError(true);
          }
          return;
        }
        const list = Array.isArray(data.sections) ? (data.sections as HelpSection[]) : [];
        setSections(list);
        writeCachedSections(list);
      } catch {
        if (sections.length === 0) {
          setSections([]);
          setSectionsError(true);
        }
      } finally {
        if (shouldShowSpinner) setLoadingSections(false);
      }
    },
    [readCachedSections, sections.length, writeCachedSections]
  );

  // Warm cache on mount so opening the sheet is instant.
  useEffect(() => {
    if (!session.isAuthenticated) return;
    const cached = readCachedSections();
    if (cached && cached.length > 0) setSections((prev) => (prev.length > 0 ? prev : cached));
    // Background refresh (doesn't block UI)
    void loadSections({ background: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isAuthenticated]);

  useEffect(() => {
    if (!open) return;
    if (session.isAuthenticated) {
      // Show cached topics immediately; refresh in background.
      void loadSections({ background: true });
    }
  }, [open, session.isAuthenticated, loadSections]);

  useEffect(() => {
    if (!open) {
      setOrderHelpContext(null);
      return;
    }
    setSheetStep("topics");
    setSelectedTopic(null);
    setMessage(null);
    setCreatedTicket(null);
    setPendingTicket(null);
    setOrderPickRows([]);
    setOrderPickSearch("");
    setOrderPickVisibleCount(ORDER_PICK_PAGE_SIZE);
    setOrdersError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setComposeText(orderHelpContext?.prefillDescription?.trim() ?? "");
  }, [open, orderHelpContext]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Allow other UI (e.g. order history Help) to open this sheet with optional order context.
  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<MxNeedHelpOpenDetail>).detail;
      if (detail && typeof detail === "object") {
        setOrderHelpContext({
          formattedOrderId: detail.formattedOrderId?.trim() || undefined,
          coreOrderId:
            detail.coreOrderId != null && Number.isFinite(Number(detail.coreOrderId))
              ? Number(detail.coreOrderId)
              : undefined,
          prefillSubject: detail.prefillSubject?.trim() || undefined,
          prefillDescription: detail.prefillDescription?.trim() || undefined,
        });
      } else {
        setOrderHelpContext(null);
      }
      setOpen(true);
    };
    window.addEventListener(MX_OPEN_NEED_HELP_EVENT, onOpen);
    return () => window.removeEventListener(MX_OPEN_NEED_HELP_EVENT, onOpen);
  }, []);

  const rootSections = useMemo(() => {
    const roots = sections.filter((s) => s.parent_title_id == null);
    if (roots.length === 0 && sections.length > 0) return [...sections].sort(sortSections);
    return [...roots].sort(sortSections);
  }, [sections]);

  const childSections = useMemo(() => {
    if (!selectedTopic) return [];
    return sections
      .filter((s) => s.parent_title_id === selectedTopic.ticket_title_id)
      .sort(sortSections);
  }, [sections, selectedTopic]);

  const createTicket = useCallback(
    async (
      ticketTitleId: number,
      description: string,
      subject: string,
      orderOverride?: { formattedOrderId?: string; coreOrderId?: number },
    ) => {
      const storeId = readSelectedStoreId();
      if (!session.isAuthenticated) {
        setMessage({ type: "error", text: "Please sign in to contact support." });
        return;
      }
      if (!storeId) {
        setMessage({
          type: "error",
          text: "Select a store from the header switcher first.",
        });
        return;
      }
      const desc = description.trim();
      if (!desc) {
        setMessage({ type: "error", text: "Please add a short description." });
        return;
      }

      setLoading(true);
      setMessage(null);
      try {
        const formattedOid =
          orderOverride?.formattedOrderId?.trim() ||
          orderHelpContext?.formattedOrderId?.trim();
        const coreOid = orderOverride?.coreOrderId ?? orderHelpContext?.coreOrderId;
        const orderPrefix =
          formattedOid != null && formattedOid !== ""
            ? `Order ID: ${formattedOid}`
            : null;
        const descriptionWithOrder = orderPrefix ? `${orderPrefix}\n\n${desc}` : desc;
        const subjectBase = subject.trim().slice(0, 500);
        const subjectWithOrder =
          orderHelpContext?.prefillSubject?.trim() ||
          (formattedOid && subjectBase ? `${subjectBase} · ${formattedOid}` : subjectBase) ||
          (formattedOid ? `Order ${formattedOid}` : undefined);

        const res = await fetch("/api/merchant/partner-store-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_id: storeId,
            ticket_title_id: ticketTitleId,
            subject: subjectWithOrder,
            description: descriptionWithOrder.slice(0, 5000),
            formatted_order_id: formattedOid || undefined,
            core_order_id: coreOid,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          setMessage({
            type: "error",
            text: typeof data?.error === "string" ? data.error : "Could not create ticket. Try again.",
          });
          return;
        }
        const t = data.ticket as { id?: unknown; ticket_id?: unknown };
        const idNum =
          typeof t.id === "number" && Number.isInteger(t.id)
            ? t.id
            : typeof t.id === "string" && /^\d+$/.test(t.id)
              ? Number(t.id)
              : NaN;
        const publicId = t.ticket_id != null ? String(t.ticket_id).trim() : "";
        if (!Number.isInteger(idNum) || idNum < 1 || !publicId) {
          setMessage({ type: "error", text: "Ticket created but response was incomplete. Check User insights." });
          return;
        }
        setCreatedTicket({ id: idNum, ticket_id: publicId });
        setSheetStep("success");
      } catch {
        setMessage({ type: "error", text: "Something went wrong. Please try again." });
      } finally {
        setLoading(false);
      }
    },
    [session.isAuthenticated, orderHelpContext],
  );

  const loadOrdersForPick = useCallback(async () => {
    const storeId = readSelectedStoreId();
    if (!storeId) {
      setOrdersError("Select a store from the header switcher first.");
      setOrderPickRows([]);
      return;
    }
    setLoadingOrders(true);
    setOrdersError(null);
    try {
      const res = await fetch(
        `/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=50`,
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrdersError("Could not load orders. Try again.");
        setOrderPickRows([]);
        return;
      }
      const rows = Array.isArray(data.orders) ? (data.orders as OrderPickRow[]) : [];
      setOrderPickRows(rows);
      if (rows.length === 0) {
        setOrdersError("No recent orders found for this store.");
      }
    } catch {
      setOrdersError("Could not load orders. Try again.");
      setOrderPickRows([]);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const beginOrderPick = useCallback(
    (draft: PendingTicketDraft) => {
      setPendingTicket(draft);
      setOrderPickSearch("");
      setOrderPickVisibleCount(ORDER_PICK_PAGE_SIZE);
      setSheetStep("orderPick");
      void loadOrdersForPick();
    },
    [loadOrdersForPick],
  );

  const filteredOrderPickRows = useMemo(() => {
    const q = orderPickSearch.trim().toLowerCase();
    if (!q) return orderPickRows;
    return orderPickRows.filter((order) => {
      const label = (order.formatted_order_id?.trim() || String(order.order_id)).toLowerCase();
      const customer = (order.customer_name ?? "").toLowerCase();
      const status = (order.order_status ?? "").toLowerCase();
      return label.includes(q) || customer.includes(q) || status.includes(q);
    });
  }, [orderPickRows, orderPickSearch]);

  const visibleOrderPickRows = useMemo(
    () => filteredOrderPickRows.slice(0, orderPickVisibleCount),
    [filteredOrderPickRows, orderPickVisibleCount],
  );

  const hasMoreOrderPickRows = filteredOrderPickRows.length > orderPickVisibleCount;

  const onSelectOrderForTicket = useCallback(
    (order: OrderPickRow) => {
      if (!pendingTicket) return;
      const formattedOid =
        order.formatted_order_id?.trim() || String(order.order_id);
      void createTicket(
        pendingTicket.ticketTitleId,
        pendingTicket.description,
        pendingTicket.subject,
        { formattedOrderId: formattedOid, coreOrderId: order.order_id },
      );
    },
    [pendingTicket, createTicket],
  );

  const onTopicClick = (topic: HelpSection) => {
    setSelectedTopic(topic);
    const children = sections.filter((s) => s.parent_title_id === topic.ticket_title_id);
    const hasQuick = topic.quick_options.length > 0;
    if (children.length > 0 || hasQuick) {
      setSheetStep("options");
    } else {
      setSheetStep("compose");
      setComposeText("");
    }
  };

  const onPickChild = (child: HelpSection) => {
    const subject = `${selectedTopic?.title ?? "Support"} · ${child.title}`;
    const description = [selectedTopic?.title, child.title, child.subtitle]
      .filter(Boolean)
      .join(" — ");
    beginOrderPick({
      ticketTitleId: child.ticket_title_id,
      subject,
      description,
    });
  };

  const onPickQuick = (text: string) => {
    if (!selectedTopic) return;
    const subject = `${selectedTopic.title} · ${text.slice(0, 80)}`;
    beginOrderPick({
      ticketTitleId: selectedTopic.ticket_title_id,
      subject,
      description: text,
    });
  };

  const onComposeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopic) return;
    const subject = selectedTopic.title;
    void createTicket(selectedTopic.ticket_title_id, composeText, subject);
  };

  const goBack = () => {
    if (sheetStep === "orderPick") {
      setSheetStep("options");
      setPendingTicket(null);
      setOrderPickRows([]);
      setOrdersError(null);
      setMessage(null);
      return;
    }
    if (sheetStep === "compose" || sheetStep === "options") {
      setSheetStep("topics");
      setSelectedTopic(null);
      setComposeText("");
      setMessage(null);
      setPendingTicket(null);
    }
  };

  const goToTicketDashboard = () => {
    if (!createdTicket) return;
    try {
      localStorage.setItem("userInsights_selectedTicketId", String(createdTicket.id));
    } catch {
      /* ignore */
    }
    const sid = readSelectedStoreId();
    const q = new URLSearchParams({ ticket: String(createdTicket.id) });
    if (sid) q.set("storeId", sid);
    router.push(`/partners/support-inbox?${q.toString()}`);
    setOpen(false);
  };

  const showChildList = sheetStep === "options" && childSections.length > 0;
  const showQuickList = sheetStep === "options" && childSections.length === 0 && (selectedTopic?.quick_options.length ?? 0) > 0;

  return (
    <>
      <button
        type="button"
        aria-label="Need help — contact support"
        onClick={() => setOpen(true)}
        className={
          variant === "headerLink"
            ? `hidden inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-gray-700 underline decoration-gray-400 underline-offset-2 hover:text-gray-900 lg:inline-flex ${className || ""}`.trim()
            : `relative z-[1000] inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 text-blue-900 font-medium text-xs sm:text-sm transition-all duration-200 shadow-sm hover:shadow-md border border-blue-200 hover:border-blue-300 min-w-fit ${className || ""}`.trim()
        }
      >
        <Headphones size={16} className="text-blue-600 flex-shrink-0" />
        <span className="whitespace-nowrap text-xs sm:text-sm">Need a hand!</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[2200]" role="dialog" aria-modal="true" aria-labelledby="help-sheet-title">
          {/* Backdrop: blocks clicks to the app but does NOT close the sheet */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />

          <div className="absolute inset-y-0 right-0 z-[2201] flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-slate-200 animate-in slide-in-from-right duration-300">
            <div className="flex shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-start gap-2">
                {(sheetStep === "options" || sheetStep === "compose" || sheetStep === "orderPick") && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <div className="min-w-0">
                  <h3 id="help-sheet-title" className="truncate text-lg font-bold text-slate-900">
                    {sheetStep === "success"
                      ? "Ticket created"
                      : sheetStep === "orderPick"
                        ? "Select order"
                        : "Help and Support"}
                  </h3>
                  {selectedStoreId && sheetStep !== "success" ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Store:{" "}
                      <span className="font-mono font-medium text-slate-700">{selectedStoreId}</span>
                    </p>
                  ) : null}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar px-5 py-3">
              {session.isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : !session.isAuthenticated ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Please{" "}
                  <a href="/auth" className="font-semibold underline">
                    sign in
                  </a>{" "}
                  to create a support ticket.
                </p>
              ) : sheetStep === "success" && createdTicket ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <CheckCircle2 className="mb-4 h-14 w-14 text-emerald-500" aria-hidden />
                  <p className="mb-2 text-sm font-semibold text-slate-900">Your support ticket is ready</p>
                  <p className="mb-1 text-xs text-slate-500">Ticket ID</p>
                  <p className="mb-6 font-mono text-lg font-bold tracking-tight text-slate-900">{createdTicket.ticket_id}</p>
                  <p className="mb-6 max-w-sm text-sm leading-relaxed text-slate-600">
                    You can view and reply to this ticket anytime under{" "}
                    <span className="font-medium text-slate-800">User insights</span> → support inbox (support tickets).
                  </p>
                </div>
              ) : (
                <>
                  {orderHelpContext?.formattedOrderId ? (
                    <p className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                      Order ID:{" "}
                      <span className="font-mono font-semibold">{orderHelpContext.formattedOrderId}</span>
                    </p>
                  ) : null}
                  {message && message.type === "error" && (
                    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message.text}</p>
                  )}

                  {loadingSections ? (
                    <div className="flex items-center gap-2 py-8 text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Loading topics…</span>
                    </div>
                  ) : sectionsError ? (
                    <div className="space-y-2 py-4">
                      <p className="text-sm text-red-600">Could not load help topics.</p>
                      <button type="button" onClick={() => loadSections()} className="text-sm font-medium text-blue-600 hover:underline">
                        Retry
                      </button>
                    </div>
                  ) : rootSections.length === 0 ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 py-4 text-sm text-amber-900">
                      No help topics yet. Email{" "}
                      <a href="mailto:support@gatimitra.com" className="font-medium underline">
                        support@gatimitra.com
                      </a>
                      .
                    </p>
                  ) : sheetStep === "topics" ? (
                    <ul className="divide-y divide-slate-100">
                      {rootSections.map((s) => (
                        <li key={s.ticket_title_id}>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => onTopicClick(s)}
                            className="flex w-full items-start gap-3 py-4 pr-1 text-left transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-900">{s.title}</p>
                              {s.subtitle ? <p className="mt-0.5 text-sm text-slate-500">{s.subtitle}</p> : null}
                            </div>
                            <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : sheetStep === "orderPick" ? (
                    <div className="space-y-3 pb-4">
                      <p className="text-sm text-slate-600">
                        Choose the order this ticket is about.
                      </p>
                      {!selectedStoreId ? (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Select a store from the header switcher.
                        </p>
                      ) : loadingOrders ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span className="text-sm">Loading orders…</span>
                        </div>
                      ) : ordersError ? (
                        <div className="space-y-2">
                          <p className="text-sm text-red-600">{ordersError}</p>
                          <button
                            type="button"
                            onClick={() => void loadOrdersForPick()}
                            className="text-sm font-medium text-[#2ecc9b] hover:underline"
                          >
                            Retry
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <Search
                              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                              aria-hidden
                            />
                            <input
                              type="search"
                              value={orderPickSearch}
                              onChange={(e) => {
                                setOrderPickSearch(e.target.value);
                                setOrderPickVisibleCount(ORDER_PICK_PAGE_SIZE);
                              }}
                              placeholder="Search by order ID, customer, or status"
                              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2ecc9b] focus:ring-2 focus:ring-[#2ecc9b]/20"
                            />
                          </div>
                          {filteredOrderPickRows.length === 0 ? (
                            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                              No orders match your search.
                            </p>
                          ) : (
                            <>
                              <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                {visibleOrderPickRows.map((order) => {
                            const label =
                              order.formatted_order_id?.trim() || `#${order.order_id}`;
                            const when = order.created_at
                              ? new Date(order.created_at).toLocaleString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "";
                            return (
                              <li key={order.id}>
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() => onSelectOrderForTicket(order)}
                                  className="flex w-full items-center justify-between gap-3 px-3 py-3.5 text-left hover:bg-emerald-50/60 disabled:opacity-50"
                                >
                                  <span className="min-w-0">
                                    <span className="block font-mono text-sm font-semibold text-slate-900">
                                      {label}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-slate-500">
                                      {[order.customer_name, order.order_status, when]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  </span>
                                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                                </button>
                              </li>
                            );
                          })}
                              </ul>
                              {hasMoreOrderPickRows ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOrderPickVisibleCount((n) => n + ORDER_PICK_PAGE_SIZE)
                                  }
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-[#2ecc9b] transition hover:bg-emerald-50/50"
                                >
                                  View past orders
                                </button>
                              ) : null}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ) : sheetStep === "options" && selectedTopic ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <div className="bg-slate-100 px-3 py-2.5">
                        <p className="text-sm font-semibold text-slate-800">Select an option to proceed</p>
                      </div>
                      <ul className="divide-y divide-slate-200 bg-white">
                        {showChildList
                          ? childSections.map((c) => (
                              <li key={c.ticket_title_id}>
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() => onPickChild(c)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-3.5 text-left hover:bg-slate-50 disabled:opacity-50"
                                >
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium text-slate-800">{c.title}</span>
                                    {c.subtitle ? (
                                      <span className="mt-0.5 block text-xs text-slate-500">{c.subtitle}</span>
                                    ) : null}
                                  </span>
                                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                                </button>
                              </li>
                            ))
                          : showQuickList
                            ? selectedTopic.quick_options.map((q, idx) => (
                                <li key={`${idx}-${q.slice(0, 24)}`}>
                                  <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => onPickQuick(q)}
                                    className="flex w-full items-center justify-between gap-2 px-3 py-3.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    <span className="min-w-0 truncate">{q}</span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                                  </button>
                                </li>
                              ))
                            : null}
                      </ul>
                    </div>
                  ) : sheetStep === "compose" && selectedTopic ? (
                    <form onSubmit={onComposeSubmit} className="space-y-3 pb-4">
                      <p className="text-sm text-slate-600">{selectedTopic.title}</p>
                      <label className="block text-sm font-medium text-slate-700">Describe your issue</label>
                      <textarea
                        value={composeText}
                        onChange={(e) => setComposeText(e.target.value)}
                        rows={5}
                        maxLength={5000}
                        required
                        className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                        placeholder="Tell us what you need help with…"
                      />
                      <button
                        type="submit"
                        disabled={loading || !composeText.trim()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2ecc9b] py-2.5 text-sm font-semibold text-white hover:bg-[#26b888] disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create ticket"}
                      </button>
                    </form>
                  ) : null}
                </>
              )}
            </div>

            {session.isAuthenticated && !session.isLoading && sheetStep === "topics" && (
              <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full rounded-xl border border-slate-300 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            )}

            {session.isAuthenticated && !session.isLoading && sheetStep === "success" && createdTicket && (
              <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-5 py-4">
                <button
                  type="button"
                  onClick={goToTicketDashboard}
                  className="w-full rounded-xl bg-[#2ecc9b] py-3 text-sm font-semibold text-white hover:bg-[#26b888]"
                >
                  Go to ticket dashboard
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
};

function sortSections(a: HelpSection, b: HelpSection) {
  const ao = a.display_order ?? 999999;
  const bo = b.display_order ?? 999999;
  if (ao !== bo) return ao - bo;
  return a.title.localeCompare(b.title);
}

export default NeedHelpBadge;

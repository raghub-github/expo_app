"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { useMerchantSession } from "@/context/MerchantSessionContext";

const badgeColor = "#2ecc9b";

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

type SheetStep = "topics" | "options" | "compose" | "success";

type CreatedTicketSummary = { id: number; ticket_id: string };

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
  const session = useMerchantSession();
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

  const loadSections = useCallback(async () => {
    setLoadingSections(true);
    setSectionsError(false);
    try {
      const res = await fetch("/api/merchant/help-sections");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setSections([]);
        setSectionsError(true);
        return;
      }
      const list = Array.isArray(data.sections) ? data.sections : [];
      setSections(list as HelpSection[]);
    } catch {
      setSections([]);
      setSectionsError(true);
    } finally {
      setLoadingSections(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (session.isAuthenticated) {
      loadSections();
    }
  }, [open, session.isAuthenticated, loadSections]);

  useEffect(() => {
    if (open) {
      setSheetStep("topics");
      setSelectedTopic(null);
      setComposeText("");
      setMessage(null);
      setCreatedTicket(null);
    }
  }, [open]);

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
    async (ticketTitleId: number, description: string, subject: string) => {
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
        const res = await fetch("/api/merchant/partner-store-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_id: storeId,
            ticket_title_id: ticketTitleId,
            subject: subject.trim().slice(0, 500) || undefined,
            description: desc.slice(0, 5000),
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
    [session.isAuthenticated]
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
    const description = [selectedTopic?.title, child.title, child.subtitle].filter(Boolean).join(" — ");
    void createTicket(child.ticket_title_id, description, subject);
  };

  const onPickQuick = (text: string) => {
    if (!selectedTopic) return;
    const subject = `${selectedTopic.title} · ${text.slice(0, 80)}`;
    void createTicket(selectedTopic.ticket_title_id, text, subject);
  };

  const onComposeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopic) return;
    const subject = selectedTopic.title;
    void createTicket(selectedTopic.ticket_title_id, composeText, subject);
  };

  const goBack = () => {
    if (sheetStep === "compose" || sheetStep === "options") {
      setSheetStep("topics");
      setSelectedTopic(null);
      setComposeText("");
      setMessage(null);
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
    const q = new URLSearchParams({ view: "inbox", ticket: String(createdTicket.id) });
    if (sid) q.set("storeId", sid);
    router.push(`/mx/user-insights?${q.toString()}`);
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
        style={
          variant === "headerLink"
            ? undefined
            : {
                position: inline ? "relative" : "fixed",
                right: inline ? undefined : -12,
                bottom: inline ? undefined : 40,
                zIndex: 1000,
                background: badgeColor,
                color: "#010004",
                border: "none",
                borderRadius: 24,
                padding: "8px 20px",
                fontWeight: 600,
                fontSize: 12,
                boxShadow: "0 4px 24px rgba(44,204,155,0.18)",
                cursor: "pointer",
              }
        }
        className={
          variant === "headerLink"
            ? `hidden text-sm text-gray-700 underline decoration-gray-400 underline-offset-2 hover:text-gray-900 lg:inline ${className || ""}`.trim()
            : className
        }
      >
        Need a hand !
      </button>

      {open && (
        <div className="fixed inset-0 z-[2200]" role="dialog" aria-modal="true" aria-labelledby="help-sheet-title">
          {/* Backdrop: blocks clicks to the app but does NOT close the sheet */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />

          <div className="absolute inset-y-0 right-0 z-[2201] flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-slate-200 animate-in slide-in-from-right duration-300">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-center gap-2">
                {(sheetStep === "options" || sheetStep === "compose") && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <h3 id="help-sheet-title" className="truncate text-lg font-bold text-slate-900">
                  {sheetStep === "success" ? "Ticket created" : "Help &amp; support"}
                </h3>
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
                  <a href="/auth/login" className="font-semibold underline">
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
                  {readSelectedStoreId() ? (
                    <p className="mb-3 text-xs text-slate-500">
                      Store: <span className="font-mono font-medium text-slate-700">{readSelectedStoreId()}</span>
                    </p>
                  ) : (
                    <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Select a store from the header switcher.
                    </p>
                  )}

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
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
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

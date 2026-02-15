"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X, Settings, Ticket, User } from "lucide-react";

const STORAGE_RECENT_SEARCHES = "global-search-recent";
const STORAGE_RECENT_VIEWED = "global-search-recent-viewed";
const MAX_RECENT_SEARCHES = 10;
const MAX_RECENT_VIEWED = 10;

type SearchTab = "all" | "tickets" | "contacts" | "solutions";

interface RecentViewedItem {
  id: number;
  ticketNumber: string;
  subject: string;
}

interface TicketResult {
  id: number;
  ticketNumber: string;
  subject: string;
  status?: string;
}

interface ContactResult {
  id: number | string;
  name: string;
  email?: string;
}

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_RECENT_SEARCHES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (!query.trim()) return;
  const list = getRecentSearches().filter((q) => q.trim().toLowerCase() !== query.trim().toLowerCase());
  list.unshift(query.trim());
  try {
    localStorage.setItem(STORAGE_RECENT_SEARCHES, JSON.stringify(list.slice(0, MAX_RECENT_SEARCHES)));
  } catch {}
}

function clearRecentSearches() {
  try {
    localStorage.removeItem(STORAGE_RECENT_SEARCHES);
  } catch {}
}

function getRecentViewed(): RecentViewedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_RECENT_VIEWED);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToRecentViewed(item: RecentViewedItem) {
  const list = getRecentViewed().filter((v) => v.id !== item.id);
  list.unshift(item);
  try {
    localStorage.setItem(STORAGE_RECENT_VIEWED, JSON.stringify(list.slice(0, MAX_RECENT_VIEWED)));
  } catch {}
}

function clearRecentViewed() {
  try {
    localStorage.removeItem(STORAGE_RECENT_VIEWED);
  } catch {}
}

export function GlobalSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const [ticketResults, setTicketResults] = useState<TicketResult[]>([]);
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [ticketTotal, setTicketTotal] = useState(0);
  const [contactTotal, setContactTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentViewed, setRecentViewed] = useState<RecentViewedItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sync search input from URL when on tickets page (e.g. landed with ?q=foo) so search bar works correctly
  useEffect(() => {
    if (pathname?.startsWith("/dashboard/tickets")) {
      const urlQ = searchParams?.get("q") ?? "";
      setQuery((prev) => (urlQ !== prev ? urlQ : prev));
    }
  }, [pathname, searchParams?.toString()]);

  const loadStorage = useCallback(() => {
    setRecentSearches(getRecentSearches());
    setRecentViewed(getRecentViewed());
  }, []);

  useEffect(() => {
    loadStorage();
  }, [loadStorage, expanded]);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [expanded]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setTicketResults([]);
      setContactResults([]);
      setTicketTotal(0);
      setContactTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/tickets?q=${encodeURIComponent(q)}&limit=5&offset=0`).then((r) => r.json()),
      fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=5&page=1`).then((r) => r.json()).catch(() => ({ success: false, data: [], pagination: { total: 0 } })),
    ]).then(([ticketRes, customerRes]) => {
      if (cancelled) return;
      setLoading(false);
      if (ticketRes.success && ticketRes.data?.tickets) {
        setTicketResults(ticketRes.data.tickets.slice(0, 5));
        setTicketTotal(ticketRes.data.total ?? ticketRes.data.tickets.length);
      } else {
        setTicketResults([]);
        setTicketTotal(0);
      }
      if (customerRes.success && Array.isArray(customerRes.data)) {
        const contacts: ContactResult[] = (customerRes.data as any[]).slice(0, 5).map((c: any) => ({
          id: c.id ?? c.customer_id,
          name: c.name ?? c.full_name ?? c.email ?? "—",
          email: c.email,
        }));
        setContactResults(contacts);
        setContactTotal(customerRes.pagination?.total ?? customerRes.data?.length ?? 0);
      } else {
        setContactResults([]);
        setContactTotal(0);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [query]);

  const handleSelectRecentSearch = (q: string) => {
    setQuery(q);
    inputRef.current?.focus();
  };

  const handleClearRecentSearches = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  const handleClearRecentViewed = () => {
    clearRecentViewed();
    setRecentViewed([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      saveRecentSearch(q);
      setRecentSearches(getRecentSearches());
      router.push(`/dashboard/tickets?q=${encodeURIComponent(q)}`);
      setExpanded(false);
    }
  };

  const showResults = query.trim().length > 0;
  const showRecent = !showResults;

  return (
    <div ref={wrapRef} className="relative flex items-center">
      {expanded ? (
        <>
          {/* Search bar (stays in flow) */}
          <form onSubmit={handleSubmit} className="w-full min-w-[180px] sm:min-w-[240px] max-w-[400px] md:max-w-[520px] flex items-center gap-2 rounded-xl border border-blue-200 bg-white shadow-md px-3 py-2 ring-1 ring-blue-100">
            <Search className="h-5 w-5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tickets, contacts…"
              className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none py-0.5"
              autoComplete="off"
              aria-label="Global search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>
          {/* Dropdown panel - absolute below */}
          <div className="absolute left-0 right-0 top-full mt-1.5 min-w-[280px] max-w-[min(100vw-2rem,520px)] rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden z-[100]">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b border-gray-100 flex-wrap">
            {(["all", "tickets", "contacts", "solutions"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab === "all" ? "All" : tab}
              </button>
            ))}
            <button
              type="button"
              className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              aria-label="Search settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[min(70vh,420px)] overflow-y-auto">
            {showRecent && (
              <>
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recently searched</span>
                    {recentSearches.length > 0 && (
                      <button type="button" onClick={handleClearRecentSearches} className="text-xs font-medium text-blue-600 hover:underline">
                        Clear
                      </button>
                    )}
                  </div>
                  {recentSearches.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No recent searches</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {recentSearches.slice(0, 8).map((q, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => handleSelectRecentSearch(q)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Search className="h-4 w-4 text-gray-400 shrink-0" />
                            <span className="truncate">{q}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="px-4 py-3 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recently viewed</span>
                    {recentViewed.length > 0 && (
                      <button type="button" onClick={handleClearRecentViewed} className="text-xs font-medium text-blue-600 hover:underline">
                        Clear
                      </button>
                    )}
                  </div>
                  {recentViewed.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No recently viewed tickets</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {recentViewed.slice(0, 8).map((item) => (
                        <li key={item.id}>
                          <Link
                            href={`/dashboard/tickets/${item.id}`}
                            onClick={() => setExpanded(false)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                              <Ticket className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{item.subject || "—"}</span>
                              <span className="text-xs text-gray-500">#{item.ticketNumber}</span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {showResults && (
              <div className="px-4 py-3 space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  </div>
                ) : (
                  <>
                    {(activeTab === "all" || activeTab === "tickets") && (
                      <section>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tickets</span>
                          {ticketTotal > 0 && (
                            <Link
                              href={`/dashboard/tickets?q=${encodeURIComponent(query.trim())}`}
                              onClick={() => setExpanded(false)}
                              className="text-xs font-medium text-blue-600 hover:underline"
                            >
                              View all ({ticketTotal.toLocaleString()})
                            </Link>
                          )}
                        </div>
                        {ticketResults.length === 0 ? (
                          <p className="text-sm text-gray-400 py-2">No tickets found</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {ticketResults.map((t) => (
                              <li key={t.id}>
                                <Link
                                  href={`/dashboard/tickets/${t.id}`}
                                  onClick={() => {
                                    setExpanded(false);
                                    if (query.trim()) saveRecentSearch(query.trim());
                                    addToRecentViewed({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject ?? "" });
                                  }}
                                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50"
                                >
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                                    <Ticket className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-gray-900">{t.subject || "—"}</span>
                                    <span className="text-xs text-gray-500">#{t.ticketNumber}</span>
                                  </div>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    )}
                    {(activeTab === "all" || activeTab === "contacts") && (
                      <section>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contacts</span>
                          {contactTotal > 0 && (
                            <Link
                              href={`/dashboard/customers?search=${encodeURIComponent(query.trim())}`}
                              onClick={() => setExpanded(false)}
                              className="text-xs font-medium text-blue-600 hover:underline"
                            >
                              View all ({contactTotal.toLocaleString()})
                            </Link>
                          )}
                        </div>
                        {contactResults.length === 0 ? (
                          <p className="text-sm text-gray-400 py-2">No contacts found</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {contactResults.map((c) => (
                              <li key={String(c.id)}>
                                <Link
                                  href={`/dashboard/customers/${c.id}`}
                                  onClick={() => {
                                    setExpanded(false);
                                    if (query.trim()) saveRecentSearch(query.trim());
                                  }}
                                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50"
                                >
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                                    <User className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-gray-900">{c.name}</span>
                                    {c.email && <span className="block truncate text-xs text-gray-500">{c.email}</span>}
                                  </div>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    )}
                    {(activeTab === "all" || activeTab === "solutions") && (
                      <section>
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Solutions</span>
                        <p className="text-sm text-gray-400 py-2">No solutions yet. Coming soon.</p>
                      </section>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/80 hover:bg-gray-100 px-3 py-2.5 w-full min-w-[140px] max-w-[280px] sm:max-w-[320px] text-left transition-colors"
          aria-label="Open search"
        >
          <Search className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 shrink-0" />
          <span className="hidden sm:inline text-sm text-gray-500 truncate">Search tickets, contacts</span>
        </button>
      )}
    </div>
  );
}

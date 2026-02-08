"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { CollapsibleTableFilters } from "./CollapsibleTableFilters";
import { FilterChips, type FilterChipItem } from "./FilterChips";
import { FilterSearchBar } from "./FilterSearchBar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TablePagination } from "./TablePagination";
import Link from "next/link";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface TicketRow {
  id: number;
  riderId: number;
  orderId: number | null;
  category: string;
  priority: string;
  subject: string;
  message: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByEmail?: string | null;
  resolvedByName?: string | null;
}

function resolvedByLabel(t: TicketRow): string {
  if (t.resolvedByEmail) return t.resolvedByEmail;
  if (t.resolvedByName) return t.resolvedByName;
  return "—";
}

export function RiderTicketsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const [searchInput, setSearchInput] = useState(searchValue);
  const [orderRelated, setOrderRelated] = useState(searchParams.get("orderRelated") || "all");
  const [category, setCategory] = useState(searchParams.get("category") || "all");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");
  const [filterSearch, setFilterSearch] = useState(searchParams.get("q") || "");

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setTickets([]);
      return;
    }
    setResolveLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Database not available");
      let query = supabase.from("riders").select("id, name, mobile");
      const isPhone = /^\d{10,}$/.test(value.replace(/^\+?91/, ""));
      const isRiderId = /^GMR(\d+)$/i.test(value);
      const isNumeric = /^\d{1,9}$/.test(value);
      if (isRiderId) query = query.eq("id", parseInt(value.replace(/^GMR/i, ""), 10));
      else if (isNumeric) query = query.eq("id", parseInt(value, 10));
      else if (isPhone) query = query.eq("mobile", value.replace(/^\+?91/, ""));
      else query = query.ilike("mobile", `%${value}%`);
      const { data, error: e } = await query.limit(1).single();
      if (e || !data) {
        setRider(null);
        setTickets([]);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: any) {
      setError(err?.message || "Failed to resolve rider");
      setRider(null);
      setTickets([]);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const fetchTickets = useCallback(async (riderId: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (orderRelated !== "all") params.set("orderRelated", orderRelated);
      if (category !== "all") params.set("category", category);
      if (status !== "all") params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (filterSearch.trim()) params.set("q", filterSearch.trim());
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const res = await fetch(`/api/riders/${riderId}/tickets?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load tickets");
      setTickets(json.data?.tickets ?? []);
      setTotal(json.data?.total ?? 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load tickets");
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [orderRelated, category, status, from, to, filterSearch, page, pageSize]);

  const riderFromContext = riderContext?.currentRiderInfo
    ? { id: riderContext.currentRiderInfo.id, name: riderContext.currentRiderInfo.name, mobile: riderContext.currentRiderInfo.mobile }
    : null;

  useEffect(() => setSearchInput(searchValue), [searchValue]);
  useEffect(() => setFilterSearch(searchParams.get("q") || ""), [searchParams.get("q")]);
  useEffect(() => {
    if (searchValue) resolveRider(searchValue);
    else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setTickets([]);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);
  useEffect(() => {
    if (rider) fetchTickets(rider.id);
  }, [rider, fetchTickets]);

  useEffect(() => {
    setPage(1);
  }, [orderRelated, category, status, from, to, filterSearch]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const applyFilters = () => {
    setPage(1);
    const p = new URLSearchParams();
    if (searchValue) p.set("search", searchValue);
    if (orderRelated !== "all") p.set("orderRelated", orderRelated);
    if (category !== "all") p.set("category", category);
    if (status !== "all") p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (filterSearch.trim()) p.set("q", filterSearch.trim());
    router.push(`/dashboard/riders/tickets?${p.toString()}`);
  };

  const hasSearch = searchValue.length > 0;

  const ticketFilterChips: FilterChipItem[] = [];
  if (filterSearch.trim()) ticketFilterChips.push({ key: "q", label: `Search: "${filterSearch.trim().slice(0, 20)}${filterSearch.trim().length > 20 ? "…" : ""}"` });
  if (orderRelated !== "all") ticketFilterChips.push({ key: "orderRelated", label: `Order: ${orderRelated === "yes" ? "Related" : "Non-order"}` });
  if (category !== "all") ticketFilterChips.push({ key: "category", label: `Category: ${category}` });
  if (status !== "all") ticketFilterChips.push({ key: "status", label: `Status: ${status}` });
  if (from) ticketFilterChips.push({ key: "from", label: `From: ${from}` });
  if (to) ticketFilterChips.push({ key: "to", label: `To: ${to}` });

  const removeTicketFilter = (key: string) => {
    if (key === "q") setFilterSearch("");
    else if (key === "orderRelated") setOrderRelated("all");
    else if (key === "category") setCategory("all");
    else if (key === "status") setStatus("all");
    else if (key === "from") setFrom("");
    else if (key === "to") setTo("");
  };

  const clearAllTicketFilters = () => {
    setPage(1);
    setFilterSearch("");
    setOrderRelated("all");
    setCategory("all");
    setStatus("all");
    setFrom("");
    setTo("");
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Tickets"
        description="Use the search in the nav bar to select a rider. Filter by order-related, category, status, and date."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
      />
      {rider && (
        <>
          <CollapsibleTableFilters
            label="Filters"
            activeCount={[filterSearch.trim(), orderRelated, category, status, from, to].filter((v) => v && v !== "all").length}
            filterChipsSlot={ticketFilterChips.length > 0 ? <FilterChips inline chips={ticketFilterChips} onRemove={removeTicketFilter} onClearAll={clearAllTicketFilters} /> : null}
            trailingSlot={
              <>
                <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap">Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-6 sm:h-7 min-w-[2.5rem] rounded border border-gray-300 bg-white px-1.5 text-[10px] sm:text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  aria-label="Rows per page"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} disabled={loading} ariaLabel="Tickets" compact />
              </>
            }
            filterContent={
              <>
                <FilterSearchBar
                  value={filterSearch}
                  onChange={setFilterSearch}
                  onSubmit={applyFilters}
                  placeholder="Ticket ID, Order ID, title…"
                  // hint="Match ticket ID, order ID, or title/message"
                  id="tickets-filter-search"
                />
                <div className="min-w-[110px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Order</label>
                  <select value={orderRelated} onChange={(e) => setOrderRelated(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="all">All</option>
                    <option value="yes">Order related</option>
                    <option value="no">Non-order</option>
                  </select>
                </div>
                <div className="min-w-[100px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
                    <option value="all">All</option>
                    <option value="payment">Payment</option>
                    <option value="order">Order</option>
                    <option value="technical">Technical</option>
                    <option value="account">Account</option>
                    <option value="food">Food</option>
                    <option value="parcel">Parcel</option>
                    <option value="person_ride">Person Ride</option>
                  </select>
                </div>
                <div className="min-w-[100px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="all">All</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">From</label>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">To</label>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="button" onClick={clearAllTicketFilters} className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors h-[34px] shrink-0">Clear filters</button>
              </>
            }
          >
          <div className="overflow-hidden relative">
            {loading && tickets.length === 0 ? (
              <div className="flex justify-center py-12"><LoadingSpinner size="md" text="Loading tickets..." /></div>
            ) : (
              <>
                {loading && tickets.length > 0 && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10">
                    <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                  </div>
                )}
                <div className={`overflow-x-auto transition-opacity duration-200 rounded-lg border border-gray-200 ${loading && tickets.length > 0 ? "opacity-70 pointer-events-none" : ""}`}>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Ticket ID</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Order</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Status</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide min-w-[120px]">Title</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Concern</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide min-w-[140px]">First message</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Priority</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">Created</th>
                      <th className="px-2 py-2.5 w-10 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">Details</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tickets.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500 text-sm">No tickets found.</td></tr>
                    ) : (
                      tickets.map((t) => {
                        const isExpanded = expandedTicketId === t.id;
                        return (
                          <React.Fragment key={t.id}>
                            <tr className={`hover:bg-gray-50/80 transition-colors ${isExpanded ? "bg-gray-50" : ""}`}>
                              <td className="px-3 py-2 font-mono font-medium text-gray-900">{t.id}</td>
                              <td className="px-3 py-2 text-gray-700">{t.orderId != null ? `#${t.orderId}` : "—"}</td>
                              <td className="px-3 py-2"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${t.status === "resolved" || t.status === "closed" ? "bg-green-100 text-green-800" : t.status === "in_progress" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{t.status.replace("_", " ")}</span></td>
                              <td className="px-3 py-2 font-medium text-gray-900 max-w-[160px] truncate" title={t.subject}>{t.subject}</td>
                              <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{t.category}</td>
                              <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate" title={t.message}>{t.message || "—"}</td>
                              <td className="px-3 py-2 text-gray-700 whitespace-nowrap capitalize">{t.priority}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                                  className="p-1.5 rounded-md hover:bg-gray-200 text-gray-600 transition-colors"
                                  aria-expanded={isExpanded}
                                  title={isExpanded ? "Hide details" : "Show details"}
                                >
                                  <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-gray-50/90 border-b border-gray-200">
                                <td colSpan={9} className="px-4 py-4 text-sm">
                                  <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                                    <p className="font-semibold text-gray-800">Rider&apos;s first message</p>
                                    <p className="text-gray-700 whitespace-pre-wrap break-words">{t.message || "—"}</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 pt-2 border-t border-gray-100 text-gray-600">
                                      {t.orderId != null && <div><span className="font-medium text-gray-500">Order ID:</span> #{t.orderId}</div>}
                                      <div><span className="font-medium text-gray-500">Resolved by:</span> {resolvedByLabel(t)}</div>
                                      {t.resolution && <div className="sm:col-span-2"><span className="font-medium text-gray-500">Resolution:</span> {t.resolution}</div>}
                                      <div><span className="font-medium text-gray-500">Resolved at:</span> {t.resolvedAt ? new Date(t.resolvedAt).toLocaleString() : "—"}</div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </div>
          </CollapsibleTableFilters>
        </>
      )}
    </div>
  );
}

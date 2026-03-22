"use client";

import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Store, ChevronRight, CheckCircle, Clock, XCircle, Sparkles, Ban } from "lucide-react";
import { StoreDashboardSkeleton } from "./stores/[id]/StoreDashboardSkeleton";
import { MerchantParentSkeleton } from "./MerchantParentSkeleton";
import { useMerchantsSearch } from "@/context/MerchantsSearchContext";
import { useMerchantStoresStatsQuery } from "@/hooks/queries/useMerchantStoreQueries";

type FilterMode = "child" | "parent";

type StoreStats = {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  new: number;
};

type ChildRow = {
  type: "child";
  id: number;
  store_id: string;
  parent_id: number | null;
  name: string;
  city: string | null;
  approval_status: string;
  onboarding_step: number | null;
  onboarding_completed: boolean | null;
  store_email?: string | null;
  store_phones?: string[] | null;
  created_at?: string | null;
  verified_by_email?: string | null;
};

type ParentRow = {
  type: "parent";
  id: number;
  merchant_id: string;
  name: string;
  phone: string | null;
  city: string | null;
  approval_status: string;
  children: ChildRow[];
};

type ApiResponse =
  | {
      success: true;
      filter: "parent";
      items: ParentRow[];
      nextCursor: string | null;
    }
  | {
      success: true;
      filter: "child";
      items: ChildRow[];
      nextCursor: string | null;
    }
  | { success: false; error: string; code?: string };

function formatCreatedDate(created_at: string | null | undefined): string {
  if (!created_at) return "—";
  try {
    const d = new Date(created_at);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function primaryPhone(store_phones: string[] | null | undefined): string | null {
  if (!store_phones || store_phones.length === 0) return null;
  return store_phones[0] ?? null;
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  const base = "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium";
  if (s === "APPROVED") {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-800`}>
        <CheckCircle className="h-3 w-3" />
        Verified
      </span>
    );
  }
  if (s === "REJECTED" || s === "BLOCKED" || s === "SUSPENDED") {
    return (
      <span className={`${base} bg-red-100 text-red-800`}>
        <XCircle className="h-3 w-3" />
        Rejected
      </span>
    );
  }
  if (s === "DELISTED") {
    return (
      <span className={`${base} bg-red-100 text-red-800`}>
        <XCircle className="h-3 w-3" />
        Delisted
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-100 text-amber-800`}>
      <Clock className="h-3 w-3" />
      Pending
    </span>
  );
}

function ChildActionButton({
  child,
  returnTo,
  portal,
  onNavigate,
}: {
  child: ChildRow;
  returnTo: string;
  portal: "admin" | "merchant";
  onNavigate: () => void;
}) {
  const status = (child.approval_status || "").toUpperCase();
  const isVerified = status === "APPROVED";
  const isDelisted = status === "DELISTED";
  const goesToDashboard = isVerified || isDelisted;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onNavigate();
      }}
      className={
        goesToDashboard
          ? "inline-flex cursor-pointer items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          : "inline-flex cursor-pointer items-center gap-1 rounded bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
      }
    >
      {goesToDashboard ? (
        <>
          <Store className="h-3.5 w-3.5" />
          Dashboard
        </>
      ) : (
        <>
          <CheckCircle className="h-3.5 w-3.5" />
          Verify Store
        </>
      )}
    </button>
  );
}

/** Narrow email-style row: unread (pending) = highlighted, read (verified/rejected) = light. No checkboxes. */
function ChildStoreRow({
  child,
  returnTo,
  portal,
  onChildClick,
  compact = false,
}: {
  child: ChildRow;
  returnTo: string;
  portal: "admin" | "merchant";
  onChildClick: (child: ChildRow) => void;
  compact?: boolean;
}) {
  const status = (child.approval_status || "").toUpperCase();
  const isUnread =
    status !== "APPROVED" &&
    status !== "REJECTED" &&
    status !== "BLOCKED" &&
    status !== "SUSPENDED" &&
    status !== "DELISTED";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onChildClick(child)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChildClick(child);
        }
      }}
      className={`flex items-center justify-between gap-2 border-b border-gray-100/80 px-3 py-1.5 cursor-pointer transition-colors last:border-b-0 ${
        isUnread
          ? "bg-slate-50 hover:bg-slate-100/80"
          : "bg-white hover:bg-gray-50/80"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-indigo-100">
          <Store className="h-3.5 w-3.5 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap">
          <span className={`truncate ${isUnread ? "font-semibold text-gray-900" : "font-normal text-gray-700"}`}>
            {child.name}
          </span>
          <span className={`truncate text-[10px] shrink-0 ${isUnread ? "text-gray-600" : "text-gray-400"}`}>
            {child.store_id}
            {child.city ? ` · ${child.city}` : ""}
          </span>
          {(primaryPhone(child.store_phones) || child.store_email || child.created_at || child.verified_by_email) && !compact && (
            <span className={`text-[10px] shrink-0 ${isUnread ? "text-gray-500" : "text-gray-400"}`}>
              {primaryPhone(child.store_phones) && `Ph: ${primaryPhone(child.store_phones)}`}
              {child.store_email && ` · ${child.store_email.length > 18 ? child.store_email.slice(0, 18) + "…" : child.store_email}`}
              {child.verified_by_email && ` · Verified by: ${child.verified_by_email.length > 22 ? child.verified_by_email.slice(0, 22) + "…" : child.verified_by_email}`}
              {child.created_at && ` · Created: ${formatCreatedDate(child.created_at)}`}
            </span>
          )}
        </div>
        <StatusBadge status={child.approval_status} />
      </div>
      <ChildActionButton child={child} returnTo={returnTo} portal={portal} onNavigate={() => onChildClick(child)} />
    </div>
  );
}

type CategoryKey = "total" | "verified" | "pending" | "rejected" | "new";

interface StatCardConfig {
  key: CategoryKey;
  label: string;
  count: number;
  icon: React.ReactNode;
  bg: string;
  border: string;
}

const CARD_MIN_HEIGHT = "min-h-[110px]";

const StatCardsRow = React.memo(function StatCardsRow({
  cards,
  category,
  onCategoryClick,
}: {
  cards: StatCardConfig[];
  category: CategoryKey | null;
  onCategoryClick: (key: CategoryKey) => void;
}) {
  if (cards.length === 0) return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(({ key, label, count, icon, bg, border }) => {
        const isActive = category === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onCategoryClick(key)}
            className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-2.5 text-left transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${CARD_MIN_HEIGHT} ${
              isActive
                ? `ring-2 ring-indigo-600 ring-offset-2 ${bg} ${border}`
                : `${bg} ${border} hover:border-gray-300`
            }`}
            aria-pressed={isActive}
          >
            <span className={`flex items-center ${isActive ? "text-gray-800" : "text-gray-600"}`}>{icon}</span>
            <span className="text-lg font-semibold leading-tight text-gray-900">{count}</span>
            <span className={`text-[10px] font-medium ${isActive ? "text-gray-700" : "text-gray-500"}`}>{label}</span>
          </button>
        );
      })}
    </div>
  );
});

export function MerchantsSearchClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const merchantsSearch = useMerchantsSearch();

  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parentItems, setParentItems] = useState<ParentRow[]>([]);
  const [childItems, setChildItems] = useState<ChildRow[]>([]);
  const [dateFromInput, setDateFromInput] = useState("");
  const [dateToInput, setDateToInput] = useState("");

  const fromDate = useMemo(() => searchParams.get("fromDate") ?? "", [searchParams]);
  const toDate = useMemo(() => searchParams.get("toDate") ?? "", [searchParams]);
  const statsQuery = useMerchantStoresStatsQuery(fromDate || undefined, toDate || undefined);
  const stats: StoreStats | null =
    statsQuery.data && (statsQuery.data as { success?: boolean }).success
      ? {
          total: (statsQuery.data as StoreStats).total ?? 0,
          verified: (statsQuery.data as StoreStats).verified ?? 0,
          pending: (statsQuery.data as StoreStats).pending ?? 0,
          rejected: (statsQuery.data as StoreStats).rejected ?? 0,
          new: (statsQuery.data as StoreStats).new ?? 0,
        }
      : null;
  const statsLoading = statsQuery.isLoading;

  const filter = useMemo((): FilterMode => {
    if (searchParams.get("parent") === "true") return "parent";
    return "child";
  }, [searchParams]);

  const searchQuery = useMemo(
    () => searchParams.get("search")?.trim() ?? "",
    [searchParams]
  );

  const category = useMemo(
    () => searchParams.get("category") as CategoryKey | null,
    [searchParams]
  );

  const hasSearchParams = searchQuery.length > 0;
  const hasCategory = category != null && ["verified", "pending", "rejected", "new", "total"].includes(category);

  const lastSearchTrigger = merchantsSearch?.lastSearchTrigger ?? 0;
  const triggeredSearch = merchantsSearch?.triggeredSearch ?? null;
  const clearTriggeredSearch = merchantsSearch?.clearTriggeredSearch ?? (() => {});

  const effectiveSearch = triggeredSearch ? triggeredSearch.value : searchQuery;
  const effectiveFilter = triggeredSearch ? triggeredSearch.filter : filter;
  const hasEffectiveSearchParams = effectiveSearch.length > 0;
  const shouldFetchList = hasEffectiveSearchParams || (hasCategory && effectiveFilter === "child");

  /** When user clicks Search (same or new value), reset immediately so we never show stale result or fake "Not Found". Skeleton shows on next paint. */
  useLayoutEffect(() => {
    if (!shouldFetchList || lastSearchTrigger === 0) return;
    setLoading(true);
    setHasSearched(false);
    setError(null);
    setParentItems([]);
    setChildItems([]);
  }, [lastSearchTrigger, shouldFetchList]);

  const returnTo = useMemo(
    () => `/dashboard/merchants?${searchParams.toString()}`,
    [searchParams]
  );

  const portal: "admin" | "merchant" =
    searchParams.get("portal") === "merchant" ? "merchant" : "admin";

  /** When merchant portal has an active list search, show skeleton until API completes. Never show "Not Found" before loading finishes. */
  const hasActiveListSearch = hasEffectiveSearchParams || (hasCategory && effectiveFilter === "child");
  /** Show skeleton as soon as Search is clicked (triggeredSearch) or while API is in flight (loading || !hasSearched). Avoids showing tagline/empty state during search. */
  const showSkeleton = Boolean(
    portal === "merchant" && (triggeredSearch != null || (hasActiveListSearch && (loading || !hasSearched)))
  );

  const setPortal = (value: "admin" | "merchant") => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("portal", value);
    router.push(`/dashboard/merchants?${next.toString()}`);
  };

  // Sync date filter inputs from URL
  useEffect(() => {
    setDateFromInput(searchParams.get("fromDate") ?? "");
    setDateToInput(searchParams.get("toDate") ?? "");
  }, [searchParams]);

  // Sync merchant search state to context for RightSidebar skeleton and store card (shared loading = loading || !hasSearched)
  // NOTE: We intentionally omit `merchantsSearch` from deps to avoid an infinite loop, since the context
  // value object changes whenever its internal state updates. The setter itself is stable via useCallback.
  useEffect(() => {
    if (!merchantsSearch) return;
    const isMerchantPortalWithSearch = portal === "merchant" && hasActiveListSearch;
    if (!isMerchantPortalWithSearch) {
      merchantsSearch.setMerchantsSearchState({
        isLoading: false,
        hasSearched: false,
        searchResultStore: null,
        filter,
      });
      return;
    }
    const effectiveLoading = loading || !hasSearched;
    merchantsSearch.setMerchantsSearchState({
      isLoading: effectiveLoading,
      hasSearched,
      searchResultStore:
        !loading && hasSearched && filter === "child" && childItems.length === 1
          ? {
              storeId: childItems[0].id,
              name: childItems[0].name,
              store_id: childItems[0].store_id,
              full_address: null,
              approval_status: childItems[0].approval_status,
              store_phones: null,
            }
          : null,
      filter,
    });
  }, [portal, hasActiveListSearch, loading, hasSearched, filter, childItems, merchantsSearch?.setMerchantsSearchState]);

  useEffect(() => {
    if (!shouldFetchList) {
      setParentItems([]);
      setChildItems([]);
      setError(null);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(false);
    setError(null);
    setParentItems([]);
    setChildItems([]);

    const ac = new AbortController();
    const params = new URLSearchParams();
    params.set("filter", effectiveFilter);
    params.set("limit", "50");
    if (effectiveSearch) params.set("search", effectiveSearch);
    if (hasCategory && effectiveFilter === "child" && category && category !== "total") {
      params.set("category", category);
    }
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);

    let didRedirect = false;
    fetch(`/api/merchant/stores?${params.toString()}`, { signal: ac.signal, method: "GET" })
      .then((res) => res.json().catch(() => null) as Promise<ApiResponse | null>)
      .then((data) => {
        if (!data || data.success === false) {
          setParentItems([]);
          setChildItems([]);
          setError((data as { error?: string })?.error || "Failed to fetch merchants");
          return;
        }
        if (portal === "merchant" && data.filter === "child" && data.items.length === 1) {
          const child = data.items[0];
          const params = new URLSearchParams();
          params.set("returnTo", returnTo);
          params.set("portal", "merchant");
          didRedirect = true;
          const targetUrl = `/dashboard/merchants/stores/${child.id}?${params.toString()}`;
          // Prefetch store page chunk so it’s loading before we navigate (reduces ChunkLoadError)
          router.prefetch(targetUrl);
          setTimeout(() => {
            router.replace(targetUrl);
          }, 250);
          return;
        }
        if (data.filter === "parent") {
          setParentItems(data.items);
          setChildItems([]);
        } else {
          setParentItems([]);
          setChildItems(data.items);
        }
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setParentItems([]);
        setChildItems([]);
        setError("Failed to fetch merchants");
      })
      .finally(() => {
        if (!didRedirect) {
          setLoading(false);
          setHasSearched(true);
        }
        if (triggeredSearch) clearTriggeredSearch();
      });

    return () => ac.abort();
  }, [effectiveFilter, effectiveSearch, shouldFetchList, hasCategory, category, fromDate, toDate, portal, returnTo, router, lastSearchTrigger, triggeredSearch, clearTriggeredSearch]);

  const handleCategoryClick = (key: CategoryKey) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("category", key);
    router.push(`/dashboard/merchants?${next.toString()}`);
  };

  const applyDateFilter = () => {
    const next = new URLSearchParams(searchParams.toString());
    if (dateFromInput.trim()) next.set("fromDate", dateFromInput.trim());
    else next.delete("fromDate");
    if (dateToInput.trim()) next.set("toDate", dateToInput.trim());
    else next.delete("toDate");
    router.push(`/dashboard/merchants?${next.toString()}`);
  };

  const clearDateFilter = () => {
    setDateFromInput("");
    setDateToInput("");
    const next = new URLSearchParams(searchParams.toString());
    next.delete("fromDate");
    next.delete("toDate");
    router.push(`/dashboard/merchants?${next.toString()}`);
  };

  const handleChildClick = (child: ChildRow) => {
    const returnEnc = encodeURIComponent(returnTo);
    const status = (child.approval_status || "").toUpperCase();
    const isVerified = status === "APPROVED";
    const isDelisted = status === "DELISTED";
    if (isVerified || isDelisted) {
      const params = new URLSearchParams();
      params.set("returnTo", returnTo);
      params.set("portal", "merchant");
      if (portal === "admin") params.set("fromAdmin", "1");
      router.push(`/dashboard/merchants/stores/${child.id}?${params.toString()}`);
    } else {
      router.push(`/dashboard/merchants/verifications?storeId=${child.id}&returnTo=${returnEnc}`);
    }
  };

  const statCards: StatCardConfig[] = useMemo(
    () =>
      stats
        ? [
            {
              key: "total",
              label: "Total stores",
              count: stats.total,
              icon: <Store className="h-4 w-4" />,
              bg: "bg-slate-50",
              border: "border-slate-200 hover:border-slate-300",
            },
            {
              key: "verified",
              label: "Verified",
              count: stats.verified,
              icon: <CheckCircle className="h-4 w-4 text-emerald-600" />,
              bg: "bg-emerald-50",
              border: "border-emerald-200 hover:border-emerald-300",
            },
            {
              key: "pending",
              label: "Pending",
              count: stats.pending,
              icon: <Clock className="h-4 w-4 text-amber-600" />,
              bg: "bg-amber-50",
              border: "border-amber-200 hover:border-amber-300",
            },
            {
              key: "new",
              label: "New (30d)",
              count: stats.new,
              icon: <Sparkles className="h-4 w-4 text-indigo-600" />,
              bg: "bg-indigo-50",
              border: "border-indigo-200 hover:border-indigo-300",
            },
            {
              key: "rejected",
              label: "Rejected",
              count: stats.rejected,
              icon: <Ban className="h-4 w-4 text-red-600" />,
              bg: "bg-red-50",
              border: "border-red-200 hover:border-red-300",
            },
          ]
        : [],
    [stats]
  );

  return (
    <div className="space-y-3">
      {/* Merchant portal + list search: show skeleton only while loading; no border, no "Not Found" until API completes */}
      {showSkeleton ? (
        <div className="rounded-lg min-w-0 border-0 border-none shadow-none outline-none ring-0">
          {filter === "child" ? <StoreDashboardSkeleton /> : <MerchantParentSkeleton />}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
        <>
      {/* Main-area toggle removed: Admin/Merchant toggle stays only in header. Merchant portal: no sticky bar in main area. */}
      {portal === "admin" && (
        <div className="sticky top-0 z-10 -mx-2 bg-white px-2 pb-2 pt-0.5 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
          {/* Top row: Merchants / Assign AM title (left) + Date filter (right top, just above Rejected card area) - no bg, no shadow */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-sm font-semibold text-gray-900">
              {typeof window !== "undefined" && window.location.pathname.startsWith("/dashboard/merchants/assign-am")
                ? "Assign AM to Stores"
                : "Merchants"}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase text-gray-500">Date filter</span>
              <input
                type="date"
                value={dateFromInput}
                onChange={(e) => setDateFromInput(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                aria-label="From date"
              />
              <span className="text-xs text-gray-500">to</span>
              <input
                type="date"
                value={dateToInput}
                onChange={(e) => setDateToInput(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                aria-label="To date"
              />
              <button
                type="button"
                onClick={fromDate || toDate ? clearDateFilter : applyDateFilter}
                className={
                  fromDate || toDate
                    ? "rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    : "rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                }
              >
                {fromDate || toDate ? "Clear" : "Apply"}
              </button>
            </div>
          </div>
          {/* Stats cards row - below the filter */}
          <>
            {statsLoading ? (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`animate-pulse rounded-lg border border-gray-200 bg-gray-100 ${CARD_MIN_HEIGHT}`}
                  />
                ))}
              </div>
            ) : (
              <StatCardsRow cards={statCards} category={category} onCategoryClick={handleCategoryClick} />
            )}

            {error ? (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-medium text-red-800">{error}</p>
              </div>
            ) : null}
          </>
        </div>
      )}

      {/* Merchant portal: no card; plain tagline when no search, direct results when search. Admin: empty state or results. */}
      {portal === "merchant" && !hasSearchParams && !hasCategory ? (
        <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center">
          <p className="text-center text-gray-700 text-base">
            One search. Complete merchant context —{" "}
            <span className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent" style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              powered by GatiMitra
            </span>
          </p>
        </div>
      ) : !hasSearchParams && !hasCategory ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-center">
          <Store className="mx-auto h-8 w-8 text-gray-400" />
        </div>
      ) : hasCategory && filter === "child" ? (
        loading || !hasSearched ? (
          <div className="rounded-lg border-0 bg-white py-6 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="mt-2 text-xs text-gray-500">Loading...</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
              {category === "total" ? "All stores" : category === "verified" ? "Verified" : category === "pending" ? "Pending" : category === "new" ? "New (30d)" : "Rejected"} ({childItems.length})
            </p>
            {hasSearched && !loading && childItems.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 py-4 text-center">
                <p className="text-xs text-gray-600">No stores in this category.</p>
              </div>
            ) : childItems.length > 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                {childItems.map((child) => (
                  <ChildStoreRow
                    key={child.id}
                    child={child}
                    returnTo={returnTo}
                    portal={portal}
                    onChildClick={handleChildClick}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )
      ) : !hasSearchParams ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-center">
          <Store className="mx-auto h-8 w-8 text-gray-400" />
        </div>
      ) : hasActiveListSearch && (loading || !hasSearched) ? (
        <div className="rounded-lg border-0 bg-white py-6 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="mt-2 text-xs text-gray-500">Loading...</p>
        </div>
      ) : filter === "parent" ? (
        hasSearched && !loading && parentItems.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 py-4 text-center">
            {error ? (
              <p className="text-xs text-red-600">{error}</p>
            ) : (
              <p className="text-xs text-gray-600">No parent found. Try different search or Child.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {parentItems.map((parent) => (
              <div
                key={`parent-${parent.id}`}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white"
              >
                <div className="border-b border-gray-100 bg-gray-50/50 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-100">
                        <Store className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-900">{parent.name}</p>
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                            {parent.children.length} store{parent.children.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500">
                          {parent.merchant_id}
                          {parent.city ? ` · ${parent.city}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {parent.phone ? <span className="text-[10px] text-gray-600">{parent.phone}</span> : null}
                      <StatusBadge status={parent.approval_status} />
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2">
                  <p className="mb-1.5 text-[10px] font-medium uppercase text-gray-500">Child stores ({parent.children.length})</p>
                  {parent.children.length === 0 ? (
                    <p className="rounded bg-gray-50 py-2 text-center text-[10px] text-gray-500">No child stores yet</p>
                  ) : (
                    <ul className="border-t border-gray-100">
                      {parent.children.map((child) => (
                        <li key={child.id} className="list-none">
                          <ChildStoreRow
                            child={child}
                            returnTo={returnTo}
                            portal={portal}
                            onChildClick={handleChildClick}
                            compact
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : portal === "merchant" && filter === "child" && hasSearched && !loading && childItems.length === 0 ? (
        // Merchant portal + child: API confirmed no results (never show before loading finishes)
        <div className="rounded-lg border-0 bg-gray-50/80 py-4 text-center">
          <p className="text-xs text-gray-600">No child store found. Try different search or Parent.</p>
        </div>
      ) : portal === "merchant" && filter === "child" && childItems.length > 1 ? (
        // Merchant portal + child: multiple results – ask to use Admin
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 py-4 text-center">
          <p className="text-xs text-gray-600">Multiple child stores found. Use Admin portal to select one.</p>
        </div>
      ) : portal === "merchant" && filter === "child" && childItems.length === 1 ? (
        // Merchant portal + child: single result – show child details (redirect already handled in fetch for verified)
        <div>
          <p className="text-[10px] font-medium uppercase text-gray-500 mb-1">Child store</p>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            {childItems.map((child) => (
              <ChildStoreRow
                key={child.id}
                child={child}
                returnTo={returnTo}
                portal={portal}
                onChildClick={handleChildClick}
              />
            ))}
          </div>
        </div>
      ) : hasSearched && !loading && childItems.length === 0 ? (
        <div className="rounded-lg border-0 bg-gray-50/80 py-4 text-center">
          <p className="text-xs text-gray-600">No child store found. Try different search or Parent.</p>
        </div>
      ) : (
        <div>
          <p className="text-[10px] font-medium uppercase text-gray-500 mb-1">Child store</p>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            {childItems.map((child) => (
              <ChildStoreRow
                key={child.id}
                child={child}
                returnTo={returnTo}
                portal={portal}
                onChildClick={handleChildClick}
              />
            ))}
          </div>
        </div>
      )}
        </>
        </div>
      )}
    </div>
  );
}

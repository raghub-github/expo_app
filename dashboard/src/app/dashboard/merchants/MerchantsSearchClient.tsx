"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { Store, CheckCircle, Clock, XCircle, Pencil } from "lucide-react";
import { useMerchantsSearch } from "@/context/MerchantsSearchContext";
import { useMerchantStoresStatsQuery } from "@/hooks/queries/useMerchantStoreQueries";
import {
  parsePortalParam,
  readStoredMerchantsPortal,
  resolveMerchantsPortal,
} from "@/lib/merchants/portal-preference";
import { MerchantsAdminHome, type AdminStoreRow } from "@/components/merchants/MerchantsAdminHome";
import {
  MerchantAdminListShell,
  MerchantAdminPartnerListSkeleton,
  MerchantAdminStoreListSkeleton,
} from "@/components/merchants/MerchantAdminListShell";
import { StoreDashboardSkeleton } from "./stores/[id]/StoreDashboardSkeleton";
import { MerchantParentSkeleton } from "./MerchantParentSkeleton";
import { EXPIRED_RESUBMITTED_DOCS_LABEL } from "@/lib/merchants/expired-resubmitted-docs-label";
import { dispatchMerchantResubmittedDocsRefresh } from "@/lib/merchants/merchant-resubmitted-docs-refresh";
import { useStoreVerificationSheetOptional } from "@/context/StoreVerificationSheetContext";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import { writeStoreOperationsCache } from "@/lib/merchants/partner-store-ops-cache";

type FilterMode = "child" | "parent";

type StoreStats = {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  drafted: number;
  new: number;
  resubmitted: number;
  partners: number;
};

type ChildRow = {
  type: "child";
  id: number;
  store_id: string;
  parent_id: number | null;
  name: string;
  city: string | null;
  store_type?: string | null;
  approval_status: string;
  delisted_at?: string | null;
  onboarding_step: number | null;
  onboarding_completed: boolean | null;
  store_email?: string | null;
  store_phones?: string[] | null;
  created_at?: string | null;
  verified_by_email?: string | null;
};

function storeTypeLabel(storeType: string | null | undefined): string {
  const t = (storeType ?? "").trim().toUpperCase();
  if (!t) return "Restaurant";
  const map: Record<string, string> = {
    RESTAURANT: "Restaurant",
    CAFE: "Cafe",
    BAKERY: "Bakery",
    CLOUD_KITCHEN: "Cloud Kitchen",
    GROCERY: "Grocery",
    PHARMA: "Pharma",
    STATIONERY: "Stationery",
    ELECTRONICS_ECOMMERCE: "Electronics & E-commerce",
    OTHERS: "Others",
  };
  return map[t] ?? t;
}

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

function childDisplayStatus(child: { approval_status?: string | null; delisted_at?: string | null }): string {
  if (child.delisted_at) return "DELISTED";
  return (child.approval_status || "").toUpperCase();
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
  if (s === "DRAFT") {
    return (
      <span className={`${base} bg-sky-100 text-sky-800`}>
        <Pencil className="h-3 w-3" />
        Drafted
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
  resubmittedDocReview = false,
  onReviewDocs,
  canVerify = false,
  viewOnly = false,
}: {
  child: ChildRow;
  returnTo: string;
  portal: "admin" | "merchant";
  onNavigate: () => void;
  resubmittedDocReview?: boolean;
  onReviewDocs?: () => void;
  canVerify?: boolean;
  viewOnly?: boolean;
}) {
  if (resubmittedDocReview && onReviewDocs && canVerify && !viewOnly) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReviewDocs();
        }}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
      >
        <CheckCircle className="h-3.5 w-3.5" />
        Review docs
      </button>
    );
  }

  const status = childDisplayStatus(child);
  const isVerified = status === "APPROVED";
  const isDelisted = status === "DELISTED";
  const goesToDashboard = viewOnly || !canVerify || isVerified || isDelisted;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onNavigate();
      }}
      className={
        goesToDashboard
          ? "inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          : "inline-flex cursor-pointer items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
      }
    >
      {goesToDashboard ? (
        <>
          <Store className="h-3.5 w-3.5" />
          {viewOnly ? "View details" : "Dashboard"}
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

/** Premium result row: compact 2-line layout + status pill + CTA */
function ChildStoreRow({
  child,
  returnTo,
  portal,
  onChildClick,
  compact = false,
  resubmittedDocReview = false,
  onReviewDocs,
  canVerify = false,
  viewOnly = false,
}: {
  child: ChildRow;
  returnTo: string;
  portal: "admin" | "merchant";
  onChildClick: (child: ChildRow) => void;
  compact?: boolean;
  resubmittedDocReview?: boolean;
  onReviewDocs?: () => void;
  canVerify?: boolean;
  viewOnly?: boolean;
}) {
  const status = childDisplayStatus(child);
  const isUnread =
    status !== "APPROVED" &&
    status !== "REJECTED" &&
    status !== "BLOCKED" &&
    status !== "SUSPENDED" &&
    status !== "DELISTED";

  const iconBg =
    status === "APPROVED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "REJECTED" || status === "BLOCKED" || status === "SUSPENDED"
        ? "bg-red-50 text-red-700"
        : status === "DELISTED"
          ? "bg-red-50 text-red-700"
          : isUnread
            ? "bg-indigo-50 text-indigo-700"
            : "bg-amber-50 text-amber-700";

  const iconCircle =
    status === "APPROVED"
      ? "border-emerald-100"
      : status === "REJECTED" || status === "BLOCKED" || status === "SUSPENDED" || status === "DELISTED"
        ? "border-red-100"
        : "border-indigo-100";

  return (
    <div
      className={`group flex items-center justify-between gap-3 border-b border-gray-100/90 px-3 py-2.5 transition-all last:border-b-0 ${
        isUnread ? "bg-slate-50/80 hover:bg-slate-50" : "bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconCircle} ${iconBg}`}
        >
          <Store className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`truncate text-sm font-semibold ${
                isUnread ? "text-gray-900" : "text-gray-800"
              }`}
              title={child.name}
            >
              {child.name}
            </span>
            <span className="truncate text-[11px] text-gray-500">
              {child.store_id}
              {child.city ? ` · ${child.city}` : ""}
            </span>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
              {storeTypeLabel(child.store_type)}
            </span>
          </div>

          {(primaryPhone(child.store_phones) || child.store_email || child.created_at || child.verified_by_email) && !compact && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-gray-500">
              {primaryPhone(child.store_phones) ? <span className="whitespace-nowrap">Ph: {primaryPhone(child.store_phones)}</span> : null}
              {child.store_email ? (
                <span className="min-w-0 truncate max-w-[200px] whitespace-nowrap">
                  {child.store_email.length > 28 ? child.store_email.slice(0, 28) + "…" : child.store_email}
                </span>
              ) : null}
              {child.verified_by_email ? (
                <span className="whitespace-nowrap">Verified by: {child.verified_by_email.length > 26 ? child.verified_by_email.slice(0, 26) + "…" : child.verified_by_email}</span>
              ) : null}
              {child.created_at ? <span className="whitespace-nowrap">Created: {formatCreatedDate(child.created_at)}</span> : null}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {resubmittedDocReview ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            <Clock className="h-3 w-3" />
            Docs pending
          </span>
        ) : (
          <StatusBadge status={childDisplayStatus(child)} />
        )}
        <ChildActionButton
          child={child}
          returnTo={returnTo}
          portal={portal}
          onNavigate={() => onChildClick(child)}
          resubmittedDocReview={resubmittedDocReview}
          onReviewDocs={onReviewDocs}
          canVerify={canVerify}
          viewOnly={viewOnly}
        />
      </div>
    </div>
  );
}

type CategoryKey = "total" | "verified" | "pending" | "rejected" | "drafted" | "new" | "resubmitted" | "partners";

function buildChildStoreTargetUrl(args: {
  child: ChildRow;
  returnTo: string;
  portal: "admin" | "merchant";
  /** When false/view-only, always open store details instead of verify flow. */
  canVerify?: boolean;
  viewOnly?: boolean;
}): string {
  const { child, returnTo, portal, canVerify = true, viewOnly = false } = args;
  const storePk = Number(child?.id);
  if (!Number.isFinite(storePk) || storePk <= 0) {
    const params = new URLSearchParams();
    params.set("portal", portal);
    if (child?.store_id) params.set("search", String(child.store_id));
    params.set("child", "true");
    return `/dashboard/merchants?${params.toString()}`;
  }
  const status = childDisplayStatus(child);
  const isVerified = status === "APPROVED";
  const isDelisted = status === "DELISTED";
  const isRejectedLike = status === "REJECTED" || status === "BLOCKED" || status === "SUSPENDED";
  const forceStoreDetails = viewOnly || !canVerify || isVerified || isDelisted;

  if (forceStoreDetails) {
    const params = new URLSearchParams();
    params.set("returnTo", returnTo);
    params.set("portal", "merchant");
    return `/dashboard/merchants/stores/${storePk}?${params.toString()}`;
  }

  const vParams = new URLSearchParams();
  vParams.set("storeId", String(storePk));
  vParams.set("returnTo", returnTo);
  vParams.set("portal", portal);
  if (isRejectedLike) vParams.set("reviewRejected", "1");
  return `/dashboard/merchants/verifications?${vParams.toString()}`;
}

export function MerchantsSearchClient({
  canTogglePortal = false,
}: {
  canTogglePortal?: boolean;
}) {
  const searchParams = useAppSearchParams();
  const router = useRouter();
  const merchantsSearch = useMerchantsSearch();
  const verificationSheet = useStoreVerificationSheetOptional();
  const {
    hasAdminMerchantAccess,
    canOnboard,
    isViewOnly,
  } = useMerchantDashboardAccess();
  const canVerifyStores = canOnboard && !isViewOnly;
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const verificationSheetWasOpen = useRef(false);

  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [pendingSingleChildRedirect, setPendingSingleChildRedirect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not loaded yet (prevents premature "no results" UI on slow networks)
  const [parentItems, setParentItems] = useState<ParentRow[] | null>(null);
  const [childItems, setChildItems] = useState<ChildRow[] | null>(null);
  const [dateFromInput, setDateFromInput] = useState("");
  const [dateToInput, setDateToInput] = useState("");

  const fromDate = useMemo(() => searchParams.get("fromDate") ?? "", [searchParams]);
  const toDate = useMemo(() => searchParams.get("toDate") ?? "", [searchParams]);
  const storeTypeFilterRaw = useMemo(() => searchParams.get("storeType") ?? "", [searchParams]);
  const storeTypeFilter = storeTypeFilterRaw.trim() || undefined;
  const statsQuery = useMerchantStoresStatsQuery(fromDate || undefined, toDate || undefined, storeTypeFilter);
  const stats: StoreStats | null =
    statsQuery.data && (statsQuery.data as { success?: boolean }).success
      ? {
          total: (statsQuery.data as unknown as StoreStats).total ?? 0,
          verified: (statsQuery.data as unknown as StoreStats).verified ?? 0,
          pending: (statsQuery.data as unknown as StoreStats).pending ?? 0,
          rejected: (statsQuery.data as unknown as StoreStats).rejected ?? 0,
          drafted: (statsQuery.data as unknown as StoreStats).drafted ?? 0,
          new: (statsQuery.data as unknown as StoreStats).new ?? 0,
          resubmitted: (statsQuery.data as unknown as StoreStats & { resubmitted?: number }).resubmitted ?? 0,
          partners: (statsQuery.data as unknown as StoreStats).partners ?? 0,
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

  const category = useMemo(() => {
    if (searchParams.get("parent") === "true") return "partners" as CategoryKey;
    return searchParams.get("category") as CategoryKey | null;
  }, [searchParams]);

  const hasSearchParams = searchQuery.length > 0;
  const hasCategory =
    category != null &&
    category !== "partners" &&
    ["verified", "pending", "rejected", "drafted", "new", "total", "resubmitted"].includes(category);

  const lastSearchTrigger = merchantsSearch?.lastSearchTrigger ?? 0;
  const triggeredSearch = merchantsSearch?.triggeredSearch ?? null;
  const clearTriggeredSearch = merchantsSearch?.clearTriggeredSearch ?? (() => {});

  const effectiveSearch = triggeredSearch ? triggeredSearch.value : searchQuery;
  const effectiveFilter = triggeredSearch ? triggeredSearch.filter : filter;
  const hasEffectiveSearchParams = effectiveSearch.length > 0;
  const shouldFetchList =
    hasEffectiveSearchParams ||
    (hasCategory && effectiveFilter === "child") ||
    effectiveFilter === "parent";

  /** When user clicks Search (same or new value), reset immediately so we never show stale result or fake "Not Found". Skeleton shows on next paint. */
  useLayoutEffect(() => {
    if (!shouldFetchList || lastSearchTrigger === 0) return;
    setLoading(true);
    setHasSearched(false);
    setPendingSingleChildRedirect(false);
    setError(null);
    setParentItems(null);
    setChildItems(null);
  }, [lastSearchTrigger, shouldFetchList]);

  const returnTo = useMemo(
    () => `/dashboard/merchants?${searchParams.toString()}`,
    [searchParams]
  );

  const portal = resolveMerchantsPortal({
    portalFromUrl: parsePortalParam(searchParams.get("portal")),
    canTogglePortal: hasAdminMerchantAccess || canTogglePortal,
    storedPortal: typeof window !== "undefined" ? readStoredMerchantsPortal() : null,
  });
  const effectivePortal =
    hasAdminMerchantAccess || canTogglePortal ? portal : "merchant";

  const isExpiredResubmittedView =
    category === "resubmitted" && effectivePortal === "admin" && hasAdminMerchantAccess;
  const showAdminHome =
    effectivePortal === "admin" &&
    hasAdminMerchantAccess &&
    !hasSearchParams &&
    !hasCategory &&
    filter !== "parent";

  const buildAdminStoreUrl = (store: AdminStoreRow) =>
    buildChildStoreTargetUrl({
      child: { ...store, type: "child", parent_id: null, onboarding_step: null, onboarding_completed: null },
      returnTo,
      portal: effectivePortal,
      canVerify: canVerifyStores,
      viewOnly: isViewOnly,
    });

  const portalQuery = useMemo(() => {
    const q = new URLSearchParams(searchParams.toString());
    q.set("portal", "admin");
    return q.toString();
  }, [searchParams]);

  /** When merchant portal has an active list search, show skeleton until API completes or redirect finishes. */
  const hasActiveListSearch =
    hasEffectiveSearchParams ||
    (hasCategory && effectiveFilter === "child") ||
    effectiveFilter === "parent";
  const showSkeleton = Boolean(
    portal === "merchant" &&
      hasActiveListSearch &&
      (loading || !hasSearched || pendingSingleChildRedirect)
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
    const effectiveLoading = loading || !hasSearched || pendingSingleChildRedirect;
    merchantsSearch.setMerchantsSearchState({
      isLoading: effectiveLoading,
      hasSearched,
      searchResultStore:
        !effectiveLoading &&
        hasSearched &&
        filter === "child" &&
        childItems != null &&
        childItems.length === 1
          ? {
              storeId: childItems[0]!.id,
              name: childItems[0]!.name,
              store_id: childItems[0]!.store_id,
              full_address: null,
              approval_status: childItems[0]!.approval_status,
              store_phones: null,
            }
          : null,
      filter,
    });
  }, [portal, hasActiveListSearch, loading, hasSearched, pendingSingleChildRedirect, filter, childItems, merchantsSearch?.setMerchantsSearchState]);

  useEffect(() => {
    const setState = merchantsSearch?.setMerchantsSearchState;
    if (!setState) return;
    return () => {
      setState({
        isLoading: false,
        hasSearched: false,
        searchResultStore: null,
        filter: "child",
      });
    };
  }, [merchantsSearch?.setMerchantsSearchState]);

  /** router.push from the header runs after triggerMerchantSearch; clearing triggeredSearch in fetch.finally used to run before the URL updated, making shouldFetchList false and wiping results (flash of "not found"). Clear only once ?search= and child/parent match the triggered query. */
  useEffect(() => {
    if (!triggeredSearch) return;
    if (searchQuery.trim() !== triggeredSearch.value.trim()) return;
    if (filter !== triggeredSearch.filter) return;
    clearTriggeredSearch();
  }, [triggeredSearch, searchQuery, filter, clearTriggeredSearch]);

  useEffect(() => {
    if (!shouldFetchList) {
      setParentItems(null);
      setChildItems(null);
      setError(null);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(false);
    setPendingSingleChildRedirect(false);
    setError(null);
    setParentItems(null);
    setChildItems(null);

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
    if (storeTypeFilter) params.set("storeType", storeTypeFilter);

    fetch(`/api/merchant/stores?${params.toString()}`, { signal: ac.signal, method: "GET" })
      .then((res) => res.json().catch(() => null) as Promise<ApiResponse | null>)
      .then((data) => {
        if (!data || data.success === false) {
          setParentItems([]);
          setChildItems([]);
          setError((data as { error?: string })?.error || "Failed to fetch merchants");
          return;
        }
        if (effectivePortal === "merchant" && data.filter === "child" && data.items.length === 1) {
          const child = data.items[0];
          if (!Number.isFinite(Number(child?.id)) || Number(child.id) <= 0) {
            setParentItems(null);
            setChildItems([]);
            setError("Store found but missing id — refresh and try again");
            return;
          }
          setPendingSingleChildRedirect(true);
          setParentItems(null);
          setChildItems(null);
          const targetUrl = buildChildStoreTargetUrl({
            child,
            returnTo,
            portal: effectivePortal,
            canVerify: canVerifyStores,
            viewOnly: isViewOnly,
          });
          router.prefetch(targetUrl);
          // Warm store-status cache before dashboard mounts so the card isn't stuck on skeleton.
          const opsStoreId = String(child.id);
          void fetch(`/api/merchant/stores/${opsStoreId}/store-operations`, {
            credentials: "include",
            cache: "no-store",
          })
            .then((res) => res.json().catch(() => null))
            .then((ops) => {
              if (ops && (ops as { success?: boolean }).success) {
                writeStoreOperationsCache(opsStoreId, ops);
              }
            })
            .catch(() => undefined);
          router.replace(targetUrl);
          return;
        }
        if (data.filter === "parent") {
          setParentItems(data.items);
          setChildItems(null);
        } else {
          setParentItems(null);
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
        // Always mark request finished (including single-child redirect) so loaders/empty states never get stuck,
        // and context can expose `searchResultStore` for the sidebar while navigation is pending.
        setLoading(false);
        setHasSearched(true);
      });

    return () => ac.abort();
  }, [
    effectiveFilter,
    effectiveSearch,
    shouldFetchList,
    hasCategory,
    category,
    fromDate,
    toDate,
    storeTypeFilter,
    effectivePortal,
    canVerifyStores,
    isViewOnly,
    returnTo,
    router,
    lastSearchTrigger,
    listRefreshKey,
  ]);

  const handleResubmittedDocReview = useCallback(
    (child: ChildRow) => {
      verificationSheet?.openVerificationSheet(child.id, 4);
    },
    [verificationSheet]
  );

  const handleChildClick = useCallback(
    (child: ChildRow) => {
      if (isExpiredResubmittedView && canVerifyStores) {
        handleResubmittedDocReview(child);
        return;
      }
      router.push(
        buildChildStoreTargetUrl({
          child,
          returnTo,
          portal: effectivePortal,
          canVerify: canVerifyStores,
          viewOnly: isViewOnly,
        })
      );
    },
    [
      isExpiredResubmittedView,
      canVerifyStores,
      isViewOnly,
      handleResubmittedDocReview,
      router,
      returnTo,
      effectivePortal,
    ]
  );

  useEffect(() => {
    const open = verificationSheet?.isOpen ?? false;
    if (verificationSheetWasOpen.current && !open && isExpiredResubmittedView) {
      setListRefreshKey((k) => k + 1);
      dispatchMerchantResubmittedDocsRefresh();
    }
    verificationSheetWasOpen.current = open;
  }, [verificationSheet?.isOpen, isExpiredResubmittedView]);

  const handleCategoryClick = (key: CategoryKey) => {
    const next = new URLSearchParams(searchParams.toString());
    if (key === "partners") {
      next.delete("category");
      next.set("parent", "true");
      router.push(`/dashboard/merchants?${next.toString()}`);
      return;
    }
    next.delete("parent");
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

  const handleStoreTypeChange = (nextType: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextType) next.set("storeType", nextType);
    else next.delete("storeType");
    router.push(`/dashboard/merchants?${next.toString()}`);
  };

  return (
    <div className="space-y-3">
      {showAdminHome ? (
        <MerchantsAdminHome
          stats={stats}
          statsLoading={statsLoading}
          category={category}
          onCategoryClick={handleCategoryClick}
          fromDate={fromDate || undefined}
          toDate={toDate || undefined}
          storeType={storeTypeFilter}
          dateFromInput={dateFromInput}
          dateToInput={dateToInput}
          storeTypeFilter={storeTypeFilterRaw}
          onDateFromChange={setDateFromInput}
          onDateToChange={setDateToInput}
          onStoreTypeChange={handleStoreTypeChange}
          onApplyFilters={applyDateFilter}
          onClearFilters={clearDateFilter}
          portalQuery={portalQuery}
          buildStoreUrl={buildAdminStoreUrl}
        />
      ) : (
        <>
      {showSkeleton ? (
        <div className="rounded-lg min-w-0 border-0 border-none shadow-none outline-none ring-0">
          {filter === "child" ? <StoreDashboardSkeleton /> : <MerchantParentSkeleton />}
        </div>
      ) : (
        <div className={effectivePortal === "admin" && hasAdminMerchantAccess ? "" : "rounded-lg border border-gray-200 bg-white p-4"}>
        <>
      {error && !(effectivePortal === "admin" && hasAdminMerchantAccess) ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-medium text-red-800">{error}</p>
        </div>
      ) : null}

      {/* Merchant portal: no card; plain tagline when no search, direct results when search. Admin: empty state or results. */}
      {portal === "merchant" && !hasSearchParams && !hasCategory && filter !== "parent" ? (
        <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center">
          <p className="text-center text-gray-700 text-base">
            One search. Complete merchant context —{" "}
            <span className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent" style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              powered by GatiMitra
            </span>
          </p>
        </div>
      ) : !hasSearchParams && !hasCategory && filter !== "parent" ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-center">
          <Store className="mx-auto h-8 w-8 text-gray-400" />
        </div>
      ) : hasCategory && filter === "child" ? (
        loading || !hasSearched ? (
          <MerchantAdminStoreListSkeleton />
        ) : (
          <MerchantAdminListShell
            description={
              isExpiredResubmittedView
                ? "Stores that re-submitted expired documents. Review docs to continue verification."
                : undefined
            }
            countLabel={`${
              category === "total"
                ? "All stores"
                : category === "verified"
                  ? "Verified"
                  : category === "pending"
                    ? "Pending"
                    : category === "drafted"
                      ? "Drafted stores"
                      : category === "resubmitted"
                        ? EXPIRED_RESUBMITTED_DOCS_LABEL
                        : category === "new"
                          ? "New (30d)"
                          : "Rejected"
            } · ${childItems?.length ?? 0}`}
          >
            {hasSearched && !loading && childItems != null && childItems.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-[#121212]/55">No stores in this list.</p>
              </div>
            ) : childItems != null && childItems.length > 0 ? (
              <div className="max-h-[min(70vh,640px)] overflow-y-auto">
                {childItems.map((child) => (
                  <ChildStoreRow
                    key={child.id}
                    child={child}
                    returnTo={returnTo}
                    portal={effectivePortal}
                    onChildClick={handleChildClick}
                    resubmittedDocReview={isExpiredResubmittedView}
                    onReviewDocs={() => handleResubmittedDocReview(child)}
                    canVerify={canVerifyStores}
                    viewOnly={isViewOnly}
                  />
                ))}
              </div>
            ) : null}
          </MerchantAdminListShell>
        )
      ) : !hasSearchParams && filter !== "parent" ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-center">
          <Store className="mx-auto h-8 w-8 text-gray-400" />
        </div>
      ) : hasActiveListSearch && (loading || !hasSearched) ? (
        filter === "parent" ? (
          <MerchantAdminPartnerListSkeleton />
        ) : (
          <MerchantAdminStoreListSkeleton />
        )
      ) : filter === "parent" ? (
        hasSearched && !loading && parentItems != null && parentItems.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 py-4 text-center">
            {error ? (
              <p className="text-xs text-red-600">{error}</p>
            ) : (
              <p className="text-xs text-gray-600">No parent partner found for this search.</p>
            )}
          </div>
        ) : (
          <MerchantAdminListShell
            description="Parent accounts and their child stores."
            countLabel={`Partners · ${parentItems?.length ?? 0}`}
          >
            <div className="divide-y divide-[#121212]/08">
            {(parentItems ?? []).map((parent) => (
              <div key={`parent-${parent.id}`} className="bg-white">
                <div className="border-b border-[#121212]/06 bg-[#F3F7FA]/80 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#121212] text-white">
                        <Store className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-[#121212]">{parent.name}</p>
                          <span className="rounded-full bg-[#121212]/08 px-1.5 py-0.5 text-[10px] font-medium text-[#121212]/70">
                            {parent.children.length} store{parent.children.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#121212]/45">
                          {parent.merchant_id}
                          {parent.city ? ` · ${parent.city}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {parent.phone ? <span className="text-[10px] text-[#121212]/55">{parent.phone}</span> : null}
                      <StatusBadge status={parent.approval_status} />
                    </div>
                  </div>
                </div>
                <div className="px-1 py-1">
                  {parent.children.length === 0 ? (
                    <p className="rounded px-3 py-2 text-center text-[10px] text-[#121212]/45">No child stores yet</p>
                  ) : (
                    <ul>
                      {parent.children.map((child) => (
                        <li key={child.id} className="list-none">
                          <ChildStoreRow
                            child={child}
                            returnTo={returnTo}
                            portal={effectivePortal}
                            onChildClick={handleChildClick}
                            compact
                            canVerify={canVerifyStores}
                            viewOnly={isViewOnly}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            </div>
          </MerchantAdminListShell>
        )
      ) : portal === "merchant" && filter === "child" && hasSearched && !loading && childItems != null && childItems.length === 0 ? (
        // Merchant portal + child: API confirmed no results (never show before loading finishes)
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center shadow-sm">
          <Store className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-800">No child store found.</p>
          <p className="mt-1 text-xs text-gray-500">Check the ID (e.g. GMMC1001) or switch the dropdown to Parent Merchant.</p>
        </div>
      ) : portal === "merchant" && filter === "child" && childItems != null && childItems.length > 1 ? (
        // Merchant portal + child: multiple results – ask to use Admin
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 py-4 text-center">
          <p className="text-xs text-gray-600">Multiple child stores found. Use Admin portal to select one.</p>
        </div>
      ) : hasSearched && !loading && childItems != null && childItems.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center shadow-sm">
          <Store className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-800">No child store found.</p>
          <p className="mt-1 text-xs text-gray-500">Check the ID (e.g. GMMC1001) or switch the dropdown to Parent Merchant.</p>
        </div>
      ) : (
        <div>
          <p className="text-[10px] font-medium uppercase text-gray-500 mb-1">Child store</p>
          <div className="rounded-lg border border-gray-200 bg-white max-h-[520px] overflow-y-auto">
            {(childItems ?? []).map((child) => (
              <ChildStoreRow
                key={child.id}
                child={child}
                returnTo={returnTo}
                portal={effectivePortal}
                onChildClick={handleChildClick}
                canVerify={canVerifyStores}
                viewOnly={isViewOnly}
              />
            ))}
          </div>
        </div>
      )}
        </>
        </div>
      )}
        </>
      )}
    </div>
  );
}

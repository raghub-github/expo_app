"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  ChevronRight,
  AlertCircle,
  Building2,
  Building,
  Mail,
  Loader2,
  CheckCircle,
  ImageIcon,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { requestEmailOTP } from "@/lib/auth/supabase";
import { Logo } from "@/components/brand/Logo";

const STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "UNDER_VERIFICATION", label: "Under verification" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ACTIVE", label: "Active" },
  { key: "INACTIVE", label: "Inactive" },
  { key: "DELISTED", label: "Delisted" },
  { key: "BLOCKED", label: "Blocked" },
] as const;

/** Parent stores only: 5 stages (All + 4 approval statuses). Use for parent filter. */
const PARENT_STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "BLOCKED", label: "Blocked" },
  { key: "SUSPENDED", label: "Suspended" },
] as const;

type TabStatus = (typeof STATUS_TABS)[number]["key"];
type StoreFilter = "parent" | "child";

interface StoreItem {
  id: number;
  storeId: string;
  name: string;
  ownerPhone: string;
  status: string;
  city?: string | null;
  localityCode: string | null;
  areaCode: string | null;
  parentStoreId: number | null;
  createdAt: string;
  isParent?: boolean;
  currentOnboardingStep?: number | null;
  onboardingCompleted?: boolean | null;
  onboardingCompletedAt?: string | null;
  totalSteps?: number | null;
  pendingChildStoreInternalId?: number | null;
  pendingChildOnboardingStep?: number | null;
}

export function AreaManagerStoresClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Use URL-based filters with persistence
  const {
    filters: urlFilters,
    updateFilters,
    isInitialized: filtersInitialized,
  } = useUrlFilters({
    filters: {
      status: {
        paramName: "status",
        defaultValue: "ALL",
        validValues: [
          "ALL",
          "DRAFT",
          "SUBMITTED",
          "UNDER_VERIFICATION",
          "APPROVED",
          "REJECTED",
          "ACTIVE",
          "INACTIVE",
          "DELISTED",
          "BLOCKED",
        ] as const,
      },
      filter: {
        paramName: "filter",
        defaultValue: "parent",
        validValues: ["parent", "child"] as const,
      },
    },
  });

  const statusTab = (urlFilters.status as TabStatus) || "ALL";
  const storeFilter = (urlFilters.filter as StoreFilter) || "parent";

  // Get parentId and optional parent label/name from URL (when viewing a parent's children)
  const parentIdParam = searchParams.get("parentId");
  const selectedParentId = parentIdParam ? parseInt(parentIdParam, 10) : null;
  const parentLabel = searchParams.get("parentLabel") ?? null; // format ID e.g. GMMP1005
  const parentName = searchParams.get("parentName") ?? null;   // display name

  const [items, setItems] = useState<StoreItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalParentCount, setTotalParentCount] = useState<number | null>(null);
  const [totalChildCount, setTotalChildCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false); // only table/results when changing filter inside parent
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [registerParentOpen, setRegisterParentOpen] = useState(false);
  const [registerChildSelectParentOpen, setRegisterChildSelectParentOpen] = useState(false);
  const [parentListForChild, setParentListForChild] = useState<StoreItem[]>([]);
  const [parentListForChildLoading, setParentListForChildLoading] = useState(false);
  const [hasRegisterParentDraft, setHasRegisterParentDraft] = useState(false);
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage?.getItem("registerParentDraft") : null;
      const draft = raw ? JSON.parse(raw) : null;
      setHasRegisterParentDraft(!!(draft?.verifiedEmail));
    } catch {
      setHasRegisterParentDraft(false);
    }
  }, [registerParentOpen]);

  // Build API params from URL or overrides (for instant fetch on filter change)
  const buildParams = useCallback(
    (overrides?: { filter?: StoreFilter; status?: string | null; parentId?: string | null; search?: string | null }) => {
      const params = new URLSearchParams();
      const filter = overrides?.filter ?? (searchParams.get("filter") === "child" ? "child" : "parent");
      const status = overrides?.status !== undefined ? overrides.status : searchParams.get("status");
      const parentId = overrides?.parentId !== undefined ? overrides.parentId : searchParams.get("parentId");
      const search = overrides?.search !== undefined ? overrides.search : searchParams.get("search");

      const statusForApi = filter === "parent" && status && !["ALL", "APPROVED", "REJECTED", "BLOCKED", "SUSPENDED"].includes(status) ? null : status;
      if (statusForApi && statusForApi !== "ALL") params.set("status", statusForApi);
      params.set("filter", filter);
      if (parentId) params.set("parentId", parentId);
      if (search?.trim()) params.set("search", search.trim());
      return params;
    },
    [searchParams]
  );

  // Fetch data - uses URL params or optional overrides for instant load on filter/status change
  const fetchList = useCallback(
    async (
      cursor?: string,
      overrides?: { filter?: StoreFilter; status?: string | null; parentId?: string | null; search?: string | null; silent?: boolean }
    ) => {
      if (!filtersInitialized && !overrides) return;

      const silent = overrides?.silent === true;
      if (silent) {
        setResultsLoading(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const params = buildParams(overrides);
        params.set("limit", "20");
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/area-manager/stores?${params}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error ?? "Failed to load stores");
        }
        const json = await res.json();
        setItems(json.data?.items ?? []);
        setNextCursor(json.data?.nextCursor ?? null);
        setTotalParentCount((prev) => (json.data?.totalParentCount !== undefined ? json.data.totalParentCount : prev));
        setTotalChildCount(json.data?.totalCount ?? json.data?.totalChildCount ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
        setResultsLoading(false);
      }
    },
    [filtersInitialized, buildParams]
  );

  // Fetch when filters are initialized or URL changes (skip if we already fetched from button handler)
  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (filtersInitialized) {
      fetchList();
    }
  }, [fetchList, filtersInitialized]);

  // Fetch parent list for "Register child" modal (does not replace main list)
  const fetchParentsForChildModal = useCallback(async () => {
    setParentListForChildLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("filter", "parent");
      params.set("limit", "100");
      const res = await fetch(`/api/area-manager/stores?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load parents");
      const json = await res.json();
      setParentListForChild(json.data?.items ?? []);
    } catch {
      setParentListForChild([]);
    } finally {
      setParentListForChildLoading(false);
    }
  }, []);

  const openRegisterChildModal = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRegisterChildSelectParentOpen(true);
    // Defer fetch to next tick so modal opens without triggering layout re-render
    queueMicrotask(() => fetchParentsForChildModal());
  }, [fetchParentsForChildModal]);

  const openAddChildForParent = useCallback((e: React.MouseEvent, parent: StoreItem) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `/dashboard/area-managers/stores/add-child?parentId=${parent.id}&parentLabel=${encodeURIComponent(parent.storeId ?? "")}&parentName=${encodeURIComponent(parent.name ?? "")}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setRegisterChildSelectParentOpen(false);
  }, []);

  // Handle parent click - navigate to child stores view (inside parent; pass label and name for header)
  const handleParentClick = (parentId: number, parentStoreId?: string, parentDisplayName?: string) => {
    const params = new URLSearchParams();
    params.set("parentId", String(parentId));
    params.set("filter", "child");
    if (parentStoreId) params.set("parentLabel", parentStoreId);
    if (parentDisplayName) params.set("parentName", parentDisplayName);
    router.push(`/dashboard/area-managers/stores?${params.toString()}`, {
      scroll: false,
    });
  };

  // Parent-only valid statuses (parent_approval_status enum)
  const PARENT_VALID_STATUS = ["ALL", "APPROVED", "REJECTED", "BLOCKED", "SUSPENDED"] as const;

  // Handle filter change (Parent Stores or Child Stores only) – fetch immediately, then update URL
  const handleFilterChange = (filter: StoreFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", filter);
    params.delete("parentId");
    const currentStatus = searchParams.get("status");
    const statusForParent = filter === "parent" && currentStatus && !PARENT_VALID_STATUS.includes(currentStatus as any) ? null : currentStatus;
    if (statusForParent) params.set("status", statusForParent);
    else params.delete("status");

    updateFilters({ filter });
    skipNextFetchRef.current = true;
    fetchList(undefined, { filter, status: statusForParent ?? undefined, parentId: null, search: searchParams.get("search") });
    router.push(`/dashboard/area-managers/stores?${params.toString()}`, {
      scroll: false,
    });
  };

  // Handle status tab change – fetch immediately; when inside parent child page use silent refresh so UI stays
  const handleStatusChange = (status: TabStatus) => {
    const statusParam = status === "ALL" ? null : status;
    updateFilters({ status: statusParam });
    skipNextFetchRef.current = true;
    const filter = searchParams.get("filter") === "child" ? "child" : "parent";
    const parentId = searchParams.get("parentId");
    const silent = selectedParentId != null;
    fetchList(undefined, {
      filter,
      status: statusParam ?? undefined,
      parentId,
      search: searchParams.get("search"),
      silent,
    });
    const params = new URLSearchParams(searchParams.toString());
    if (statusParam) params.set("status", statusParam);
    else params.delete("status");
    router.replace(`/dashboard/area-managers/stores?${params.toString()}`, { scroll: false });
  };

  // Determine effective filter for UI (child when parentId is set)
  const effectiveFilter: StoreFilter =
    selectedParentId != null ? "child" : storeFilter;

  const statusTabs = effectiveFilter === "parent" ? PARENT_STATUS_TABS : STATUS_TABS;
  const effectiveStatusTab = effectiveFilter === "parent" && !PARENT_VALID_STATUS.includes(statusTab as any) ? "ALL" : statusTab;

  const isInsideParentChildPage = selectedParentId != null;

  return (
    <div className="space-y-4">
      {/* When inside a parent's child page: modular header with back nav + parent info card */}
      {isInsideParentChildPage ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between">
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              params.set("filter", "parent");
              router.push(`/dashboard/area-managers/stores?${params.toString()}`, { scroll: false });
            }}
            className="group inline-flex cursor-pointer items-center gap-2 self-start rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-800 hover:shadow"
          >
            <ChevronRight className="h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-0.5" />
            Back to parent page
          </button>
          <div className="flex min-w-0 flex-1 sm:max-w-xl sm:justify-end">
            <div className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm ring-1 ring-gray-900/5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 text-right sm:text-left">
                {parentLabel && (
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                    {parentLabel}
                  </div>
                )}
                {parentName ? (
                  <div className="mt-0.5 truncate text-sm font-medium text-gray-900" title={parentName}>
                    {parentName}
                  </div>
                ) : !parentLabel && (
                  <div className="mt-0.5 text-sm text-gray-500">Parent store</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Parent / Child filter – only when NOT inside a parent's child page */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleFilterChange("parent")}
                className={`cursor-pointer px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  effectiveFilter === "parent"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <Building2 className="h-4 w-4" />
                Parent Stores
                {totalParentCount != null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${effectiveFilter === "parent" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"}`}>
                    {totalParentCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange("child")}
                className={`cursor-pointer px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  effectiveFilter === "child"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <Building className="h-4 w-4" />
                Child Stores
                {totalChildCount != null && selectedParentId == null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${effectiveFilter === "child" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"}`}>
                    {totalChildCount}
                  </span>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={effectiveFilter === "parent" ? () => setRegisterParentOpen(true) : openRegisterChildModal}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-purple-600 bg-white px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
              aria-label={effectiveFilter === "parent" ? "Register partner" : "Register child store"}
            >
              <Plus className="h-4 w-4" />
              {effectiveFilter === "parent" ? "Register partner" : "Register child"}
            </button>
          </div>

          {/* Status filter tabs – only when NOT inside a parent's child page */}
          <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-0.5">
            {statusTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => handleStatusChange(t.key as TabStatus)}
                className={`cursor-pointer rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  effectiveStatusTab === t.key
                    ? "border-blue-600 text-blue-600 bg-blue-50/60"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : isInsideParentChildPage ? (
        <>
          {/* Inside parent: single card with heading, count, filter tabs, then table or empty state */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-gray-900">Child Stores</h3>
                    {totalChildCount != null && (
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        {totalChildCount} {totalChildCount === 1 ? "store" : "stores"}
                      </span>
                    )}
                  </div>
                  <a
                    href={`/dashboard/area-managers/stores/add-child?parentId=${selectedParentId}&parentLabel=${encodeURIComponent(parentLabel ?? "")}&parentName=${encodeURIComponent(parentName ?? "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add Child Store
                  </a>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {STATUS_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => handleStatusChange(t.key as TabStatus)}
                      className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        effectiveStatusTab === t.key
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {resultsLoading ? (
                <div className="relative px-4 py-12 text-center">
                  <LoadingSpinner />
                  <p className="mt-2 text-xs text-gray-500">Updating results…</p>
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm text-gray-500 mb-3">No child stores match the current filter.</p>
                  <a
                    href={`/dashboard/area-managers/stores/add-child?parentId=${selectedParentId}&parentLabel=${encodeURIComponent(parentLabel ?? "")}&parentName=${encodeURIComponent(parentName ?? "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add Child Store
                  </a>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Store ID</th>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Name</th>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Owner phone</th>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Status</th>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">City</th>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {items.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50/50">
                          <td className="whitespace-nowrap px-3 py-1.5 text-sm font-medium text-gray-900">
                            {s.storeId}
                          </td>
                          <td className="px-3 py-1.5 text-sm text-gray-900">{s.name}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-500">{s.ownerPhone || "-"}</td>
                          <td className="whitespace-nowrap px-3 py-1.5">
                            <span
                              className={`inline rounded px-2 py-0.5 text-xs font-medium ${
                                s.status === "APPROVED"
                                  ? "bg-green-100 text-green-800"
                                  : ["REJECTED", "BLOCKED", "DELISTED"].includes(s.status)
                                    ? "bg-red-100 text-red-800"
                                    : ["DRAFT", "SUBMITTED", "UNDER_VERIFICATION", "PENDING"].includes(s.status)
                                      ? "bg-amber-100 text-amber-800"
                                      : s.status === "ACTIVE"
                                        ? "bg-blue-100 text-blue-800"
                                        : s.status === "INACTIVE"
                                          ? "bg-gray-100 text-gray-800"
                                          : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {s.status}
                            </span>
                            {s.status === "DRAFT" && (s.currentOnboardingStep ?? null) !== null && (
                              <div className="mt-0.5 text-[11px] text-amber-700">
                                {(() => {
                                  const totalSteps = s.totalSteps ?? 9;
                                  const current = s.currentOnboardingStep ?? 1;
                                  // current step = active step; completed steps are all before it
                                  const completed = Math.max(Math.min(current - 1, totalSteps), 0);
                                  const pending = Math.max(totalSteps - completed, 0);
                                  return `Steps ${completed}/${totalSteps} • Pending ${pending}`;
                                })()}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-500">{s.city ?? s.localityCode ?? "-"}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-sm">
                            {(() => {
                              // Prefer backend truth: show button only when onboarding isn't completed.
                              // If backend value is missing, fall back to step math.
                              if (s.onboardingCompleted === false) {
                                return (
                                  <a
                                    href={`/dashboard/area-managers/stores/add-child?parentId=${encodeURIComponent(
                                      String(s.parentStoreId ?? selectedParentId ?? "")
                                    )}&storeInternalId=${encodeURIComponent(String(s.id))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                                  >
                                    Complete onboarding
                                  </a>
                                );
                              }

                              if (s.onboardingCompleted === true) {
                                return null;
                              }

                              const totalSteps = s.totalSteps ?? 9;
                              const current = s.currentOnboardingStep ?? null;
                              if (current == null) {
                                return null;
                              }

                              // Fallback: current step = active step; completed steps are all before it
                              const completed = Math.max(Math.min(current - 1, totalSteps), 0);
                              const pending = Math.max(totalSteps - completed, 0);
                              if (pending > 0) {
                                return (
                                  <a
                                    href={`/dashboard/area-managers/stores/add-child?parentId=${encodeURIComponent(
                                      String(s.parentStoreId ?? selectedParentId ?? "")
                                    )}&storeInternalId=${encodeURIComponent(String(s.id))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                                  >
                                    Complete onboarding
                                  </a>
                                );
                              }

                              return (
                                null
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          {nextCursor && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => fetchList(nextCursor)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No stores found. Add a store or adjust filters.
        </div>
      ) : (
        <>
          {/* Main table when NOT inside parent (parent list or child list without a selected parent) */}
          {items.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Store ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Owner phone</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">City</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap px-4 py-2">
                        {s.isParent && effectiveFilter === "parent" ? (
                          <button
                            type="button"
                            onClick={() => handleParentClick(s.id, s.storeId, s.name ?? undefined)}
                            className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {s.storeId}
                          </button>
                        ) : (
                          <>
                            <div className="text-sm font-medium text-gray-900">{s.storeId}</div>
                            {s.parentStoreId != null && !s.isParent && (
                              <div className="text-xs text-purple-600 mt-0.5">Parent ID: {s.parentStoreId}</div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">{s.name}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{s.ownerPhone || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span
                          className={`inline rounded px-2 py-0.5 text-xs font-medium ${
                            s.status === "APPROVED"
                              ? "bg-green-100 text-green-800"
                              : ["REJECTED", "BLOCKED", "DELISTED"].includes(s.status)
                                ? "bg-red-100 text-red-800"
                                : ["DRAFT", "SUBMITTED", "UNDER_VERIFICATION", "PENDING"].includes(s.status)
                                  ? "bg-amber-100 text-amber-800"
                                  : s.status === "ACTIVE"
                                    ? "bg-blue-100 text-blue-800"
                                    : s.status === "INACTIVE"
                                      ? "bg-gray-100 text-gray-800"
                                      : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {s.isParent && s.status === "APPROVED" ? "Verified" : s.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">{s.city ?? s.localityCode ?? "-"}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {s.isParent ? (
                          s.pendingChildStoreInternalId ? (
                            <a
                              href={`/dashboard/area-managers/stores/add-child?parentId=${s.id}&storeInternalId=${s.pendingChildStoreInternalId}&parentLabel=${encodeURIComponent(s.storeId ?? "")}&parentName=${encodeURIComponent(s.name ?? "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                            >
                              Complete onboarding
                            </a>
                          ) : (
                            <a
                              href={`/dashboard/area-managers/stores/add-child?parentId=${s.id}&parentLabel=${encodeURIComponent(s.storeId ?? "")}&parentName=${encodeURIComponent(s.name ?? "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add Child
                            </a>
                          )
                        ) : (
                          (() => {
                            if (s.onboardingCompleted === false) {
                              return (
                                <a
                                  href={`/dashboard/area-managers/stores/add-child?parentId=${encodeURIComponent(
                                    String(s.parentStoreId ?? selectedParentId ?? "")
                                  )}&storeInternalId=${encodeURIComponent(String(s.id))}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                                >
                                  Complete onboarding
                                </a>
                              );
                            }

                            if (s.onboardingCompleted === true) {
                              return null;
                            }

                            // Fallback when onboardingCompleted isn't present: use step math.
                            const totalSteps = s.totalSteps ?? 9;
                            const current = s.currentOnboardingStep ?? null;
                            if (current != null) {
                              const completed = Math.max(Math.min(current - 1, totalSteps), 0);
                              const pending = Math.max(totalSteps - completed, 0);
                              if (pending > 0) {
                                return (
                                  <a
                                    href={`/dashboard/area-managers/stores/add-child?parentId=${encodeURIComponent(
                                      String(s.parentStoreId ?? selectedParentId ?? "")
                                    )}&storeInternalId=${encodeURIComponent(String(s.id))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                                  >
                                    Complete onboarding
                                  </a>
                                );
                              }
                            }

                            // If we don't have step progress yet but status is draft, still allow continuing onboarding.
                            if (s.status === "DRAFT") {
                              return (
                                <a
                                  href={`/dashboard/area-managers/stores/add-child?parentId=${encodeURIComponent(
                                    String(s.parentStoreId ?? selectedParentId ?? "")
                                  )}&storeInternalId=${encodeURIComponent(String(s.id))}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                                >
                                  Complete onboarding
                                </a>
                              );
                            }

                            return (
                              null
                            );
                          })()
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {nextCursor && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => fetchList(nextCursor)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {addOpen && (
        <AddStoreModal
          onClose={() => setAddOpen(false)}
          onSuccess={() => {
            setAddOpen(false);
            fetchList();
          }}
          parentId={selectedParentId}
        />
      )}

      {registerParentOpen && (
        <RegisterParentModal
          onClose={() => setRegisterParentOpen(false)}
          onSuccess={() => {
            if (typeof window !== "undefined") window.sessionStorage?.removeItem("registerParentDraft");
            setRegisterParentOpen(false);
            setHasRegisterParentDraft(false);
            fetchList();
          }}
        />
      )}

      {/* Select parent to register new child – rendered in portal to avoid dashboard layout reload when opening */}
      {registerChildSelectParentOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="select-parent-title"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRegisterChildSelectParentOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-gray-200 overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 id="select-parent-title" className="text-lg font-semibold text-gray-900">Select parent to register child store</h3>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRegisterChildSelectParentOpen(false); }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-700 cursor-pointer"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {parentListForChildLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading parents…</span>
                </div>
              ) : parentListForChild.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">No parent stores found. Register a parent first.</p>
              ) : (
                <ul className="space-y-2">
                  {parentListForChild.map((parent) => (
                    <li key={parent.id}>
                      <button
                        type="button"
                        onClick={(e) => openAddChildForParent(e, parent)}
                        className="w-full text-left rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-purple-300 hover:bg-purple-50/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-gray-900 truncate">{parent.name || "—"}</div>
                            <div className="text-xs text-purple-600 font-mono mt-0.5">ID: {parent.storeId}</div>
                          </div>
                          <span className="text-sm font-medium text-purple-600 shrink-0">Register child →</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const OTP_LENGTH = 8;
const RESEND_COOLDOWN_SEC = 60;
const RATE_LIMIT_COOLDOWN_SEC = 300; // 5 min when Supabase rate limit hit (same as partnersite)
const REGISTER_PARENT_DRAFT_KEY = "registerParentDraft";
const PHONE_ALREADY_REGISTERED_MSG = "Parent already registered with this number. Try with a different number.";

type RegisterParentFormState = {
  parent_name: string;
  merchant_type: "LOCAL" | "BRAND";
  business_category: string;
  business_category_other: string;
  brand_name: string;
  registered_phone: string;
  alternate_phone: string;
  address_line1: string;
  city: string;
  state: string;
  pincode: string;
  owner_name: string;
  owner_email: string;
  store_logo: string;
};

/** Optional logo file (uploaded to R2). When set, form.store_logo is ignored on submit. */
type StoreLogoFileState = File | null;

const initialFormState: RegisterParentFormState = {
  parent_name: "",
  merchant_type: "LOCAL",
  business_category: "",
  business_category_other: "",
  brand_name: "",
  registered_phone: "",
  alternate_phone: "",
  address_line1: "",
  city: "",
  state: "",
  pincode: "",
  owner_name: "",
  owner_email: "",
  store_logo: "",
};

function RegisterParentModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  type StepType = "email" | "code" | 1 | 2 | 3;
  const [showDraftChoice, setShowDraftChoice] = useState(false);
  const [step, setStep] = useState<StepType>("email");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verifiedSupabaseUserId, setVerifiedSupabaseUserId] = useState<string | null>(null);
  const [form, setForm] = useState<RegisterParentFormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"check" | "send" | null>(null);
  const [primaryNumberVerified, setPrimaryNumberVerified] = useState(false);
  const [verifyPhoneLoading, setVerifyPhoneLoading] = useState(false);
  const [storeLogoFile, setStoreLogoFile] = useState<StoreLogoFileState>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // On mount: if draft exists, show "Continue with draft" / "Register a new one"
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage?.getItem(REGISTER_PARENT_DRAFT_KEY) : null;
      const draft = raw ? JSON.parse(raw) : null;
      setShowDraftChoice(!!(draft?.verifiedEmail));
      if (draft?.supabase_user_id) setVerifiedSupabaseUserId(draft.supabase_user_id);
    } catch {
      setShowDraftChoice(false);
    }
  }, []);

  // Persist draft when user has verified email and is on form steps
  useEffect(() => {
    if (!verifiedEmail || step === "email" || step === "code") return;
    try {
      window.sessionStorage?.setItem(REGISTER_PARENT_DRAFT_KEY, JSON.stringify({
        verifiedEmail,
        email: email || verifiedEmail,
        step,
        form,
        supabase_user_id: verifiedSupabaseUserId,
      }));
    } catch {
      // ignore
    }
  }, [verifiedEmail, step, form, email, verifiedSupabaseUserId]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Logo preview URL from selected file
  useEffect(() => {
    if (!storeLogoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(storeLogoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [storeLogoFile]);

  const setOtpDigit = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
      setOtpDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
    }
  }, [otpDigits]);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    const chars = pasted.split("");
    setOtpDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => {
        if (i < OTP_LENGTH) next[i] = c;
      });
      return next;
    });
    const focusIndex = Math.min(pasted.length, OTP_LENGTH) - 1;
    otpInputRefs.current[focusIndex]?.focus();
  }, []);

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = email.trim().toLowerCase();
    if (!raw || !/^\S+@\S+\.\S+$/.test(raw)) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    setLoading(true);
    setLoadingPhase("check");
    try {
      const checkRes = await fetch("/api/area-manager/parent-merchant/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: raw }),
      });
      const checkData = await checkRes.json();
      if (checkRes.ok && checkData.exists) {
        setError("Parent already registered with this email");
        setLoading(false);
        setLoadingPhase(null);
        return;
      }
      setLoadingPhase("send");
      const result = await requestEmailOTP(raw);
      if (!result.success) {
        if (result.error === "EMAIL_RATE_LIMIT_EXCEEDED") {
          setError(
            "Email rate limit exceeded. Please wait 5 minutes before requesting a new code."
          );
          setResendCooldown(RATE_LIMIT_COOLDOWN_SEC);
        } else {
          setError(result.error ?? "Failed to send code");
        }
        setLoadingPhase(null);
        return;
      }
      setStep("code");
      setResendCooldown(RESEND_COOLDOWN_SEC);
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
      setLoadingPhase(null);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join("");
    if (code.length !== OTP_LENGTH) {
      setError("Enter the 8-digit code from the Partner's email");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/area-manager/parent-merchant/verify-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Invalid or expired code");
        return;
      }
      setVerifiedEmail(data.verifiedEmail ?? email.trim());
      setVerifiedSupabaseUserId(data.supabase_user_id ?? null);
      setForm((prev) => ({ ...prev, owner_email: data.verifiedEmail ?? prev.owner_email }));
      setStep(1);
      try {
        window.sessionStorage?.setItem(REGISTER_PARENT_DRAFT_KEY, JSON.stringify({
          verifiedEmail: data.verifiedEmail ?? email.trim(),
          email: email.trim(),
          step: 1,
          form: { ...form, owner_email: data.verifiedEmail ?? form.owner_email },
          supabase_user_id: data.supabase_user_id ?? null,
        }));
      } catch {
        // ignore
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (["registered_phone", "alternate_phone", "pincode"].includes(name)) {
      setForm((prev) => ({ ...prev, [name]: value.replace(/\D/g, "") }));
      if (name === "registered_phone") {
        setPrimaryNumberVerified(false);
        setError((prev) => (prev === PHONE_ALREADY_REGISTERED_MSG ? null : prev));
      }
    } else if (name === "business_category") {
      setForm((prev) => ({ ...prev, business_category: value, ...(value !== "Other" ? { business_category_other: "" } : {}) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    setError(null);
  };

  const handleVerifyPrimaryNumber = async () => {
    const digits = form.registered_phone.replace(/\D/g, "").slice(-10);
    if (digits.length < 10) {
      setError("Enter a valid 10-digit primary number");
      return;
    }
    setError(null);
    setVerifyPhoneLoading(true);
    try {
      const res = await fetch("/api/area-manager/parent-merchant/check-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: digits }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not verify number");
        setPrimaryNumberVerified(false);
        return;
      }
      if (data.exists) {
        setError(PHONE_ALREADY_REGISTERED_MSG);
        setPrimaryNumberVerified(false);
        return;
      }
      setPrimaryNumberVerified(true);
    } catch {
      setError("Network error. Please try again.");
      setPrimaryNumberVerified(false);
    } finally {
      setVerifyPhoneLoading(false);
    }
  };

  const validateStep1 = () => {
    if (!form.parent_name.trim()) {
      setError("Parent name is required");
      return false;
    }
    if (!form.business_category) {
      setError("Business category is required");
      return false;
    }
    if (form.business_category === "Other" && !form.business_category_other?.trim()) {
      setError("Please specify the business category");
      return false;
    }
    if (!form.registered_phone.replace(/\D/g, "").trim()) {
      setError("Primary number is required");
      return false;
    }
    if (form.registered_phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid 10-digit mobile number");
      return false;
    }
    if (!primaryNumberVerified) {
      setError("Please verify the primary number first");
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = () => {
    if (!form.address_line1?.trim()) {
      setError("Address is required");
      return false;
    }
    if (!form.city?.trim()) {
      setError("City is required");
      return false;
    }
    if (!form.state?.trim()) {
      setError("State is required");
      return false;
    }
    if (!form.pincode?.trim() || form.pincode.length < 5) {
      setError("Valid pincode is required");
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep3 = () => {
    if (!form.owner_name?.trim()) {
      setError("Owner name is required");
      return false;
    }
    if (!form.owner_email?.trim()) {
      setError("Owner email is required");
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.owner_email)) {
      setError("Enter a valid email address");
      return false;
    }
    setError(null);
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);  };

  const handlePrev = () => {
    if (step === 1) {
      setStep("code");
      setError(null);
    } else if (step === 2 || step === 3) {
      setStep((s) => {
        if (s === 3) return 2;
        if (s === 2) return 1;
        return s;
      });
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep3()) return;
    setError(null);
    setLoading(true);
    try {
      const phone = form.registered_phone.replace(/\D/g, "").slice(-10);
      const registered_phone = phone.length >= 10 ? `+91${phone}` : form.registered_phone;
      const alternate_phone = form.alternate_phone.replace(/\D/g, "").slice(-10)
        ? `+91${form.alternate_phone.replace(/\D/g, "").slice(-10)}`
        : undefined;
      const business_category = form.business_category === "Other" ? (form.business_category_other?.trim() || undefined) : (form.business_category || undefined);

      if (storeLogoFile) {
        const fd = new FormData();
        fd.set("parent_name", form.parent_name.trim());
        fd.set("merchant_type", form.merchant_type);
        fd.set("owner_name", form.owner_name.trim());
        fd.set("owner_email", form.owner_email.trim());
        fd.set("registered_phone", registered_phone);
        if (alternate_phone) fd.set("alternate_phone", alternate_phone);
        if (form.brand_name?.trim()) fd.set("brand_name", form.brand_name.trim());
        if (business_category) fd.set("business_category", business_category);
        fd.set("address_line1", form.address_line1?.trim() ?? "");
        fd.set("city", form.city?.trim() ?? "");
        fd.set("state", form.state?.trim() ?? "");
        fd.set("pincode", form.pincode?.trim() ?? "");
        if (verifiedSupabaseUserId) fd.set("supabase_user_id", verifiedSupabaseUserId);
        fd.set("store_logo", storeLogoFile);
        const res = await fetch("/api/area-manager/parent-merchant/register", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Failed to register parent");
          return;
        }
      } else {
        const payload = {
          parent_name: form.parent_name.trim(),
          merchant_type: form.merchant_type,
          owner_name: form.owner_name.trim(),
          owner_email: form.owner_email.trim(),
          registered_phone,
          registered_phone_normalized: phone || undefined,
          alternate_phone,
          brand_name: form.brand_name?.trim() || undefined,
          business_category,
          is_active: true,
          registration_status: "VERIFIED" as const,
          address_line1: form.address_line1?.trim(),
          city: form.city?.trim(),
          state: form.state?.trim(),
          pincode: form.pincode?.trim(),
          store_logo: form.store_logo?.trim() || undefined,
          supabase_user_id: verifiedSupabaseUserId ?? undefined,
        };
        const res = await fetch("/api/area-manager/parent-merchant/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Failed to register parent");
          return;
        }
      }
      try {
        window.sessionStorage?.removeItem(REGISTER_PARENT_DRAFT_KEY);
      } catch {
        // ignore
      }
      setRegisterSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80 max-h-[90vh] overflow-hidden flex flex-col">
        {/* GatiMitra header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">{showDraftChoice ? "Complete registration" : "Register parent"}</h2>
                <p className="text-slate-300 text-xs mt-0.5">
                  {showDraftChoice && "Choose how to continue"}
                  {!showDraftChoice && step === "email" && "Verify email first"}
                  {!showDraftChoice && step === "code" && "Enter verification code"}
                  {!showDraftChoice && (step === 1 || step === 2 || step === 3) && "Business details"}
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors" aria-label="Close">
              ×
            </button>
          </div>
          {/* Step bar */}
          {!showDraftChoice && step !== "email" && step !== "code" && (
            <div className="flex gap-1.5 mt-4">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${step >= s ? "bg-white/90" : "bg-white/20"}`} />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {registerSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
                <CheckCircle className="h-10 w-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Successfully registered</h3>
              <p className="mt-1 text-sm text-slate-600">Parent partner has been registered successfully.</p>
              <button
                type="button"
                onClick={onSuccess}
                className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 shadow-lg shadow-emerald-500/25"
              >
                Done
              </button>
            </div>
          ) : (
            <>
          {error && !(step === 1 && error === PHONE_ALREADY_REGISTERED_MSG) && (
            <div className="mb-4 rounded-2xl border border-red-200/80 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Draft choice: Continue with draft or Register a new one */}
          {showDraftChoice && (
            <div className="space-y-5">
              <p className="text-sm text-slate-600">You have an incomplete registration. Continue with your draft or start a new one.</p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const raw = window.sessionStorage?.getItem(REGISTER_PARENT_DRAFT_KEY);
                      const draft = raw ? JSON.parse(raw) : null;
                      if (draft?.verifiedEmail) {
                        setVerifiedEmail(draft.verifiedEmail);
                        setVerifiedSupabaseUserId(draft.supabase_user_id ?? null);
                        setEmail(draft.email ?? draft.verifiedEmail);
                        setStep(draft.step ?? 1);
                        setForm({ ...initialFormState, ...(draft.form ?? {}) });
                        setShowDraftChoice(false);
                      } else {
                        setShowDraftChoice(false);
                      }
                    } catch {
                      setShowDraftChoice(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/25 py-3.5 text-sm transition-all"
                >
                  Continue with draft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.sessionStorage?.removeItem(REGISTER_PARENT_DRAFT_KEY);
                    } catch {
                      // ignore
                    }
                    setShowDraftChoice(false);
                    setStep("email");
                    setVerifiedEmail(null);
                    setVerifiedSupabaseUserId(null);
                    setForm(initialFormState);
                    setEmail("");
                    setError(null);
                    setPrimaryNumberVerified(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 font-medium text-slate-700 hover:bg-slate-50 py-3.5 text-sm transition-all"
                >
                  Register a new one
                </button>
              </div>
            </div>
          )}

          {/* Step 0: Email address → Send OTP */}
          {!showDraftChoice && step === "email" && (
            <form onSubmit={handleSendEmailOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Partner email address</label>
                <div className="relative group rounded-2xl border border-slate-200 bg-slate-50/50 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 transition-all">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder="partner@example.com"
                    className="block w-full rounded-2xl border-0 bg-transparent py-3.5 pl-12 pr-4 text-sm placeholder:text-slate-400 outline-none focus:ring-0"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">We&apos;ll send an 8-digit verification code to the Partner&apos;s email.</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/25 py-3.5 text-sm disabled:opacity-50 transition-all"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
                {loading && loadingPhase === "check" ? "Checking email…" : loading && loadingPhase === "send" ? "Sending OTP…" : "Send OTP to Partner's email"}
              </button>
            </form>
          )}

          {/* Step 0.5: Enter 8-digit code → Verify & continue */}
          {!showDraftChoice && step === "code" && (
            <form onSubmit={handleVerifyEmailOtp} className="space-y-5">
              <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 text-sm text-slate-700">
                Code sent to <span className="font-semibold text-slate-900">{email}</span>. Enter the 8-digit code from the Partner&apos;s email.
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Verification code</label>
                <div className="flex flex-wrap justify-center gap-1 sm:gap-1.5 mb-2">
                  {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpInputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={otpDigits[i]}
                      onChange={(e) => setOtpDigit(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      className="w-8 h-10 sm:w-9 sm:h-10 rounded-lg border border-slate-200 bg-white text-center text-base font-mono font-semibold text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 transition-all min-w-0"
                      aria-label={`Digit ${i + 1}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-500 text-center">You can request a new code in {resendCooldown > 0 ? `${resendCooldown} seconds` : "a moment"}.</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => { setStep("email"); setError(null); setOtpDigits(Array(OTP_LENGTH).fill("")); }}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  Change email
                </button>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || loading}
                  onClick={async () => {
                    if (resendCooldown > 0) return;
                    const raw = email.trim().toLowerCase();
                    if (!raw || !/^\S+@\S+\.\S+$/.test(raw)) {
                      setError("Invalid email");
                      return;
                    }
                    setError(null);
                    setLoading(true);
                    try {
                      const checkRes = await fetch("/api/area-manager/parent-merchant/check-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ email: raw }),
                      });
                      const checkData = await checkRes.json();
                      if (checkRes.ok && checkData.exists) {
                        setError("Parent already registered with this email");
                        setLoading(false);
                        return;
                      }
                      const result = await requestEmailOTP(raw);
                      if (!result.success) {
                        if (result.error === "EMAIL_RATE_LIMIT_EXCEEDED") {
                          setError("Email rate limit exceeded. Please wait 5 minutes.");
                          setResendCooldown(RATE_LIMIT_COOLDOWN_SEC);
                        } else setError(result.error ?? "Resend failed");
                        return;
                      }
                      setResendCooldown(RESEND_COOLDOWN_SEC);
                    } catch {
                      setError("Resend failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className={`py-2.5 px-4 rounded-xl border text-sm font-medium transition-all ${resendCooldown > 0 ? "border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed" : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
                </button>
                <button
                  type="submit"
                  disabled={loading || otpDigits.join("").length !== OTP_LENGTH}
                  className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-500/25 transition-all"
                >
                  {loading ? "Verifying…" : "Verify & continue"}
                </button>
              </div>
            </form>
          )}

          {!showDraftChoice && step === 1 && (
            <div className="space-y-3">
              {verifiedEmail && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span>Email verified: <strong>{verifiedEmail}</strong></span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-0.5">Parent name *</label>
                  <input name="parent_name" value={form.parent_name} onChange={handleChange} type="text" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white" placeholder="Company / brand name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-0.5">Business category *</label>
                  <select name="business_category" value={form.business_category} onChange={handleChange} className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white">
                    <option value="">Select</option>
                    <option value="Restaurant">Restaurant</option>
                    <option value="Cloud Kitchen">Cloud Kitchen</option>
                    <option value="Cafe">Cafe</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Food">Food</option>
                    <option value="Pharma">Pharma</option>
                    <option value="Grocery">Grocery</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Fashion">Fashion</option>
                    <option value="Home Decor">Home Decor</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                {form.business_category === "Other" && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-0.5">Specify other category *</label>
                    <input name="business_category_other" value={form.business_category_other} onChange={handleChange} type="text" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white" placeholder="Enter business type" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-0.5">Merchant type</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="merchant_type" value="LOCAL" checked={form.merchant_type === "LOCAL"} onChange={handleChange} className="text-blue-600 focus:ring-blue-500" />
                      <span className="text-sm text-slate-700">LOCAL</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="merchant_type" value="BRAND" checked={form.merchant_type === "BRAND"} onChange={handleChange} className="text-blue-600 focus:ring-blue-500" />
                      <span className="text-sm text-slate-700">BRAND</span>
                    </label>
                  </div>
                </div>
                {form.merchant_type === "BRAND" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-0.5">Brand name</label>
                    <input name="brand_name" value={form.brand_name} onChange={handleChange} type="text" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white" placeholder="Brand name" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-0.5">Primary number *</label>
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center rounded-lg border border-slate-200 bg-slate-50/50 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 focus-within:bg-white">
                    <span className="pl-3 text-sm text-slate-500">+91</span>
                    <input name="registered_phone" value={form.registered_phone} onChange={handleChange} type="text" inputMode="numeric" maxLength={10} className="w-full border-0 bg-transparent py-2 pr-3 text-sm outline-none focus:ring-0" placeholder="10-digit number" />
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyPrimaryNumber}
                    disabled={verifyPhoneLoading || primaryNumberVerified || form.registered_phone.replace(/\D/g, "").length < 10}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 hover:border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {verifyPhoneLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {primaryNumberVerified ? "Verified" : error === PHONE_ALREADY_REGISTERED_MSG ? "Try again" : "Verify"}
                  </button>
                  {primaryNumberVerified && (
                    <span className="flex-shrink-0 text-emerald-600" title="Primary number verified">
                      <CheckCircle className="h-6 w-6" />
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">The user will log in to the store using this primary number only.</p>
                {error === PHONE_ALREADY_REGISTERED_MSG && (
                  <div className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {PHONE_ALREADY_REGISTERED_MSG}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-0.5">Alternate phone</label>
                <div className={`flex items-center rounded-lg border border-slate-200 bg-slate-50/50 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 focus-within:bg-white ${!primaryNumberVerified ? "opacity-60 pointer-events-none" : ""}`}>
                  <span className="pl-3 text-sm text-slate-500">+91</span>
                  <input name="alternate_phone" value={form.alternate_phone} onChange={handleChange} type="text" inputMode="numeric" maxLength={10} disabled={!primaryNumberVerified} className="w-full border-0 bg-transparent py-2 pr-3 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed" placeholder="10-digit number" />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button type="button" onClick={handleNext} disabled={!primaryNumberVerified} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">
                  Next
                </button>
              </div>
            </div>
          )}

          {!showDraftChoice && step === 2 && (
            <div className="space-y-2.5">
              {verifiedEmail && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span>Email verified: <strong>{verifiedEmail}</strong></span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-0.5">Full address *</label>
                <input name="address_line1" value={form.address_line1} onChange={handleChange} type="text" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white" placeholder="Address line 1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-0.5">City *</label>
                  <input name="city" value={form.city} onChange={handleChange} type="text" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white" placeholder="City" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-0.5">State *</label>
                  <input name="state" value={form.state} onChange={handleChange} type="text" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white" placeholder="State" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-0.5">Pincode *</label>
                <input name="pincode" value={form.pincode} onChange={handleChange} type="text" inputMode="numeric" maxLength={10} className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white" placeholder="Pincode" />
              </div>
              <div className="flex justify-between gap-3 pt-1">
                <button type="button" onClick={handlePrev} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300">
                  Back
                </button>
                <button type="button" onClick={handleNext} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25">
                  Next
                </button>
              </div>
            </div>
          )}

          {!showDraftChoice && step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              {verifiedEmail && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span>Email verified: <strong>{verifiedEmail}</strong></span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-0.5">Owner name *</label>
                  <input name="owner_name" value={form.owner_name} onChange={handleChange} type="text" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white" placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-0.5">Owner email *</label>
                  <input
                    name="owner_email"
                    value={form.owner_email}
                    type="email"
                    readOnly
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-500 cursor-not-allowed"
                    placeholder="email@example.com"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <ImageIcon className="h-4 w-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">Parent / Store logo</span>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      setError("Logo must be 5 MB or smaller.");
                      return;
                    }
                    setError(null);
                    setStoreLogoFile(file);
                  }}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => logoInputRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && logoInputRef.current?.click()}
                  className="flex items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 min-h-[100px] cursor-pointer hover:border-blue-300 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {logoPreviewUrl ? (
                    <>
                      <img src={logoPreviewUrl} alt="Logo preview" className="h-16 w-16 object-contain rounded border border-slate-200 bg-white" />
                      <span className="text-xs text-slate-600 truncate max-w-[140px]">
                        {storeLogoFile?.name}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-slate-500">Click to upload logo</span>
                  )}
                </div>
                {storeLogoFile && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setStoreLogoFile(null);
                      if (logoInputRef.current) logoInputRef.current.value = "";
                    }}
                    className="mt-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:underline"
                  >
                    Remove logo
                  </button>
                )}
                <p className="mt-1 text-xs text-slate-500">JPEG, PNG or WebP. Max 5 MB. Optional.</p>
              </div>
              <div className="flex justify-between gap-3 pt-0.5">
                <button type="button" onClick={handlePrev} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300">
                  Back
                </button>
                <button type="submit" disabled={loading} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-lg shadow-emerald-500/25">
                  {loading ? "Registering…" : "Complete registration"}
                </button>
              </div>
            </form>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AddStoreModal({
  onClose,
  onSuccess,
  parentId,
}: {
  onClose: () => void;
  onSuccess: () => void;
  parentId?: number | null;
}) {
  const [storeId, setStoreId] = useState("");
  const [name, setName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/area-manager/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId: storeId.trim(),
          name: name.trim(),
          ownerPhone: ownerPhone.trim(),
          parentStoreId: parentId ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to add store");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-gray-900">
          {parentId ? "Add Child Store" : "Add Store"}
        </h3>
        {parentId && (
          <p className="mt-1 text-sm text-gray-600">Parent ID: {parentId}</p>
        )}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Store ID
            </label>
            <input
              type="text"
              required
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Owner phone
            </label>
            <input
              type="text"
              required
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Store"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

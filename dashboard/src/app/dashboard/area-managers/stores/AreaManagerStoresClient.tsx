"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import {
  Plus,
  ChevronRight,
  AlertCircle,
  Building2,
  Building,
  Loader2,
  X,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useUrlFilters } from "@/hooks/useUrlFilters";

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
  hasOpenVerificationFix?: boolean;
  openVerificationFixStep?: number | null;
  /** All open rejected steps already have pending resubmit payloads. */
  verificationFixResubmitted?: boolean;
}

export function AreaManagerStoresClient() {
  const router = useRouter();
  const searchParams = useAppSearchParams();

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
  const [registerChildSelectParentOpen, setRegisterChildSelectParentOpen] = useState(false);
  const [parentListForChild, setParentListForChild] = useState<StoreItem[]>([]);
  const [parentListForChildLoading, setParentListForChildLoading] = useState(false);
  const skipNextFetchRef = useRef(false);
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

  // Handle filter change (Parent Stores or Child Stores only) - fetch immediately, then update URL
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
              onClick={
                effectiveFilter === "parent"
                  ? () => {
                      const returnTo = encodeURIComponent(
                        `/dashboard/area-managers/stores?filter=parent${
                          searchParams.get("status")
                            ? `&status=${encodeURIComponent(searchParams.get("status")!)}`
                            : ""
                        }`
                      );
                      router.push(
                        `/dashboard/area-managers/stores/register-parent?returnTo=${returnTo}`
                      );
                    }
                  : openRegisterChildModal
              }
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-purple-600 bg-white px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
              aria-label={effectiveFilter === "parent" ? "Register Parent" : "Register child store"}
            >
              <Plus className="h-4 w-4" />
              {effectiveFilter === "parent" ? "Register Parent" : "Register child"}
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
                              if (s.hasOpenVerificationFix) {
                                if (s.verificationFixResubmitted) {
                                  return (
                                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                                      Resubmitted
                                    </span>
                                  );
                                }
                                const fixStep = s.openVerificationFixStep ?? 4;
                                return (
                                  <a
                                    href={`/dashboard/area-managers/stores/resubmit-onboarding?storeInternalId=${encodeURIComponent(
                                      String(s.id)
                                    )}&parentId=${encodeURIComponent(
                                      String(s.parentStoreId ?? selectedParentId ?? "")
                                    )}&verification_fix_step=${encodeURIComponent(String(fixStep))}&returnTo=${encodeURIComponent(
                                      "/dashboard/area-managers/stores"
                                    )}`}
                                    className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1"
                                  >
                                    Fix onboarding details
                                  </a>
                                );
                              }
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
                            if (s.hasOpenVerificationFix) {
                              if (s.verificationFixResubmitted) {
                                return (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                                    Resubmitted
                                  </span>
                                );
                              }
                              const fixStep = s.openVerificationFixStep ?? 4;
                              return (
                                <a
                                  href={`/dashboard/area-managers/stores/resubmit-onboarding?storeInternalId=${encodeURIComponent(
                                    String(s.id)
                                  )}&parentId=${encodeURIComponent(
                                    String(s.parentStoreId ?? selectedParentId ?? "")
                                  )}&verification_fix_step=${encodeURIComponent(String(fixStep))}&returnTo=${encodeURIComponent(
                                    "/dashboard/area-managers/stores"
                                  )}`}
                                  className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1"
                                >
                                  Fix onboarding details
                                </a>
                              );
                            }

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
                <X className="h-5 w-5" />
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
                          <span className="text-sm font-medium text-purple-600 shrink-0">Register child â†’</span>
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

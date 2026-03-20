"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { X, Search, Users, Loader2 } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { useMerchantsSearch } from "@/context/MerchantsSearchContext";

type SearchResult =
  | {
      kind: "parent";
      parent_id: number;
      parent_merchant_id: string;
      parent_name: string;
      city: string | null;
      registered_phone: string | null;
      assigned_ams_count: number;
      /** From parent_area_managers (one of the AMs assigned to this parent) */
      parent_direct_am_id?: number | null;
    }
  | {
      kind: "child";
      parent_id: number;
      store_internal_id: number;
      store_id: string;
      parent_merchant_id: string;
      store_name: string;
      city: string | null;
      assigned_ams_count: number;
      /** From merchant_stores.area_manager_id */
      store_direct_am_id?: number | null;
    };

type AreaManagerListItem = {
  id: number;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
};

type AssignedAreaManagerInfo = AreaManagerListItem;

type ChildStoreSummary = {
  store_internal_id: number;
  store_id: string;
  store_name: string;
  city: string | null;
  area_manager_id: number | null;
  area_manager_name: string | null;
  area_manager_email: string | null;
};

type ActivityItem = {
  id: number;
  action: "ASSIGN" | "REMOVE";
  acted_at: string;
  reason: string | null;
  area_manager_name: string | null;
  area_manager_email: string | null;
  actor_name: string | null;
  actor_email: string | null;
};

interface AssignAreaManagerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  asModal?: boolean;
}

export function AssignAreaManagerPanel({ isOpen, onClose, asModal = true }: AssignAreaManagerPanelProps) {
  const { isSuperAdmin } = usePermission();
  const merchantsSearch = useMerchantsSearch();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<SearchResult | null>(null);
  const [areaManagers, setAreaManagers] = useState<AreaManagerListItem[]>([]);
  const [areaManagersLoading, setAreaManagersLoading] = useState(false);
  const [areaManagersError, setAreaManagersError] = useState<string | null>(null);
  const [selectedAreaManagerIds, setSelectedAreaManagerIds] = useState<number[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [assignedForSelected, setAssignedForSelected] = useState<AssignedAreaManagerInfo[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [assignedError, setAssignedError] = useState<string | null>(null);
  const [areaManagerSearch, setAreaManagerSearch] = useState("");
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmModalMode, setConfirmModalMode] = useState<"overwrite" | "remove" | null>(
    null
  );
  const [removeTargetAm, setRemoveTargetAm] = useState<AssignedAreaManagerInfo | null>(
    null
  );
  const [removing, setRemoving] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [childStores, setChildStores] = useState<ChildStoreSummary[]>([]);
  const [childStoresLoading, setChildStoresLoading] = useState(false);
  const [childStoresError, setChildStoresError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ActivityItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const canAssign = useMemo(() => {
    // Only super admins for now; regular admins with MERCHANT dashboard access are also allowed via API
    return isSuperAdmin;
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedParentId(null);
      setSelectedTarget(null);
      setSelectedAreaManagerIds([]);
      setAssignMessage(null);
      setSearchError(null);
      setAreaManagersError(null);
      setAssignedForSelected([]);
      setAssignedError(null);
      setAreaManagerSearch("");
      setConfirmingOverwrite(false);
      setConfirmModalOpen(false);
      setConfirmModalMode(null);
      setRemoveTargetAm(null);
      setRemoving(false);
      setChildStores([]);
      setChildStoresError(null);
      setChildStoresLoading(false);
      merchantsSearch?.setAssignAmSearchLoading(false);
      setHistoryOpen(false);
      setHistoryItems([]);
      setHistoryError(null);
      setHistoryLoading(false);
    }
  }, [isOpen, merchantsSearch]);

  useEffect(() => {
    if (!isOpen || !canAssign) return;
    let cancelled = false;
    async function loadAreaManagers() {
      setAreaManagersLoading(true);
      setAreaManagersError(null);
      try {
        const res = await fetch("/api/area-manager/list?type=MERCHANT&limit=100");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json?.success) {
          setAreaManagersError(json?.error || "Failed to load area managers");
          return;
        }
        const items = (json.data?.items ?? []) as any[];
        setAreaManagers(
          items.map((am) => ({
            id: am.id as number,
            full_name: (am.full_name as string) ?? null,
            email: (am.email as string) ?? null,
            mobile: (am.mobile as string) ?? null,
          }))
        );
      } catch {
        if (!cancelled) setAreaManagersError("Failed to load area managers");
      } finally {
        if (!cancelled) setAreaManagersLoading(false);
      }
    }
    loadAreaManagers();
    return () => {
      cancelled = true;
    };
  }, [isOpen, canAssign]);

  const handleSearch = async (term?: string) => {
    const value = (term ?? searchQuery).trim();
    if (!value) return;
    setSearchLoading(true);
    setSearchError(null);
    setAssignMessage(null);
    try {
      const params = new URLSearchParams({ q: value, limit: "20" });
      const res = await fetch(`/api/admin/parent-area-managers/search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setSearchError(json?.error || "Search failed");
        setSearchResults([]);
        return;
      }
      setSearchResults(json.results as SearchResult[]);
    } catch {
      setSearchError("Search failed");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Sync with URL: when header search updates ?search=..., run search so results appear without refresh.
  const urlSearch = searchParams.get("search")?.trim() ?? "";
  const lastSearchedRef = useRef("");
  useEffect(() => {
    if (!isOpen || !urlSearch) return;
    if (lastSearchedRef.current === urlSearch) return;
    lastSearchedRef.current = urlSearch;

    // New search → clear any open selection so UX stays focused on the latest query
    setSelectedTarget(null);
    setSelectedParentId(null);
    setSelectedAreaManagerIds([]);
    setAssignedForSelected([]);
    setAssignedError(null);
    setConfirmingOverwrite(false);

    setSearchQuery(urlSearch.toUpperCase());
    setSearchLoading(true);
    setSearchError(null);
    setAssignMessage(null);
    merchantsSearch?.setAssignAmSearchLoading(true);
    const params = new URLSearchParams({ q: urlSearch, limit: "20" });
    fetch(`/api/admin/parent-area-managers/search?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!json?.success) {
          setSearchError(json?.error || "Search failed");
          setSearchResults([]);
          return;
        }
        setSearchResults((json.results ?? []) as SearchResult[]);
      })
      .catch(() => {
        setSearchError("Search failed");
        setSearchResults([]);
      })
      .finally(() => {
        setSearchLoading(false);
        merchantsSearch?.setAssignAmSearchLoading(false);
      });
  }, [isOpen, urlSearch, merchantsSearch]);

  const toggleAreaManager = (id: number) => {
    setSelectedAreaManagerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const loadAssignedForParent = async (parentId: number, storeInternalId?: number | null) => {
    setAssignedLoading(true);
    setAssignedError(null);
    try {
      const params = new URLSearchParams({ parentId: String(parentId) });
      if (storeInternalId != null) {
        params.set("storeInternalId", String(storeInternalId));
      }
      const res = await fetch(`/api/admin/parent-area-managers?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setAssignedError(json?.error || "Failed to load assigned Area Managers");
        setAssignedForSelected([]);
        return;
      }
      const items = (json.items as AssignedAreaManagerInfo[]) ?? [];
      setAssignedForSelected(items);
      const overallCount =
        typeof json.parentAssignedAmsCount === "number" ? json.parentAssignedAmsCount : items.length;

      // Keep "Assigned AMs" count in the search results in sync with latest assignments.
      setSearchResults((prev) =>
        prev.map((r) =>
          r.parent_id === parentId
            ? {
                ...r,
                // Always update the parent-level distinct AM count, not the store-scoped count.
                assigned_ams_count: overallCount,
              }
            : r
        )
      );

      // Preload history so the Overall History modal opens instantly.
      loadHistory(parentId, storeInternalId);
    } catch {
      setAssignedError("Failed to load assigned Area Managers");
      setAssignedForSelected([]);
    } finally {
      setAssignedLoading(false);
    }
  };

  const loadChildStores = async (parentId: number) => {
    setChildStoresLoading(true);
    setChildStoresError(null);
    try {
      const params = new URLSearchParams({ parentId: String(parentId) });
      const res = await fetch(`/api/admin/parent-area-managers/children?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setChildStoresError(json?.error || "Failed to load child stores");
        setChildStores([]);
        return;
      }
      setChildStores((json.items as ChildStoreSummary[]) ?? []);
    } catch {
      setChildStoresError("Failed to load child stores");
      setChildStores([]);
    } finally {
      setChildStoresLoading(false);
    }
  };

  const loadHistory = async (parentId: number, storeInternalId?: number | null) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({
        parentId: String(parentId),
        limit: "50",
      });
      if (storeInternalId != null) {
        params.set("storeInternalId", String(storeInternalId));
      }
      const res = await fetch(
        `/api/admin/parent-area-managers/history?${params.toString()}`
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setHistoryError(json?.error || "Failed to load history");
        setHistoryItems([]);
        return;
      }
      setHistoryItems((json.items as ActivityItem[]) ?? []);
    } catch {
      setHistoryError("Failed to load history");
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const doAssign = async () => {
    if (!selectedParentId || !selectedAreaManagerIds.length) return;
    setAssigning(true);
    setAssignMessage(null);
    try {
      const storeInternalId =
        selectedTarget?.kind === "child" ? selectedTarget.store_internal_id : null;
      const res = await fetch("/api/admin/parent-area-managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: selectedParentId,
          areaManagerIds: selectedAreaManagerIds,
          storeInternalId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setAssignMessage(json?.error || "Failed to assign Area Managers");
        return;
      }
      setAssignMessage("Area Managers assigned successfully.");
      setConfirmingOverwrite(false);
      await Promise.all([
        loadAssignedForParent(selectedParentId, storeInternalId),
        loadChildStores(selectedParentId),
      ]);
    } catch {
      setAssignMessage("Failed to assign Area Managers");
    } finally {
      setAssigning(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedParentId || !selectedAreaManagerIds.length) return;

    // When there are existing AMs, show a centralized confirmation modal before overwrite.
    if (assignedForSelected.length > 0 && !confirmingOverwrite) {
      setConfirmModalMode("overwrite");
      setConfirmModalOpen(true);
      return;
    }

    await doAssign();
  };

  const handleConfirmOverwrite = async () => {
    setConfirmModalOpen(false);
    setConfirmModalMode(null);
    setConfirmingOverwrite(true);
    await doAssign();
  };

  const handleRemoveAreaManager = async () => {
    if (!selectedParentId || !removeTargetAm) return;
    setRemoving(true);
    setAssignMessage(null);
    try {
      const storeInternalId =
        selectedTarget?.kind === "child" ? selectedTarget.store_internal_id : null;
      const res = await fetch("/api/admin/parent-area-managers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: selectedParentId,
          areaManagerId: removeTargetAm.id,
          storeInternalId,
          reason: removeReason || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setAssignMessage(json?.error || "Failed to remove Area Manager");
        return;
      }
      setAssignMessage("Area Manager removed successfully.");
      setRemoveTargetAm(null);
      setRemoveReason("");
      setConfirmModalMode(null);
      setConfirmModalOpen(false);
      await Promise.all([
        loadAssignedForParent(selectedParentId, storeInternalId),
        loadChildStores(selectedParentId),
      ]);
    } catch {
      setAssignMessage("Failed to remove Area Manager");
    } finally {
      setRemoving(false);
    }
  };

  if (!isOpen || !canAssign) return null;

  const filteredAreaManagers = useMemo(() => {
    const term = areaManagerSearch.trim().toLowerCase();
    if (!term) return areaManagers;
    return areaManagers.filter((am) => {
      const name = am.full_name ?? "";
      const email = am.email ?? "";
      const mobile = am.mobile ?? "";
      return (
        name.toLowerCase().includes(term) ||
        email.toLowerCase().includes(term) ||
        mobile.toLowerCase().includes(term)
      );
    });
  }, [areaManagers, areaManagerSearch]);

  const content = (
    <div className="w-full rounded-2xl bg-white/95 border border-slate-200/80 shadow-md">
      {/* Accent top bar */}
      <div className="h-1 w-full rounded-t-2xl bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-indigo-50 p-1.5 shadow-xs">
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Assign AM to Stores</h2>
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                Step 1: Search · Step 2: Assign
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Use the global search above to find a Parent or Child Store, then assign Area Managers here.
            </p>
          </div>
        </div>
        {asModal && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main two-panel area */}
      <div className="px-4 pt-3 pb-4 bg-slate-50/40 rounded-b-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left panel: Search results */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Search Results</h3>
              {searchQuery && (
                <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  <span className="font-mono uppercase">{searchQuery}</span>
                </span>
              )}
            </div>
            {searchError && <p className="text-xs text-red-600">{searchError}</p>}
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm min-h-0 flex flex-col ring-1 ring-slate-100">
              {searchLoading && (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  <p className="text-xs text-slate-500">Searching…</p>
                </div>
              )}
              {!searchLoading && searchResults.length === 0 && (
                <p className="px-3 py-4 text-xs text-slate-500">No results yet. Run a search.</p>
              )}
              {!searchLoading &&
                searchResults.map((r) => {
                  const isSelected = selectedParentId === r.parent_id;
                  const label =
                    r.kind === "parent"
                      ? `${r.parent_name} (${r.parent_merchant_id})`
                      : `${r.store_name} (${r.store_id})`;
                  const sub =
                    r.kind === "parent"
                      ? r.city || r.registered_phone
                      : r.city || r.parent_merchant_id;
                  const typeLabel = r.kind === "parent" ? "Parent" : "Child Store";
                  const assignedCount = r.assigned_ams_count ?? 0;
                  return (
                    <div
                      key={`${r.kind}-${r.kind === "parent" ? r.parent_id : r.store_internal_id}`}
                      className={`group flex items-stretch gap-2 px-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0 transition-all rounded-lg mx-1 my-0.5 first:mt-1 ${
                        isSelected
                          ? "bg-gradient-to-r from-indigo-50 to-white shadow-sm ring-1 ring-indigo-200/60"
                          : "bg-white hover:from-slate-50 hover:to-white hover:shadow-xs"
                      }`}
                    >
                      {/* Accent bar */}
                      <div
                        className={`w-0.5 rounded-full self-stretch shrink-0 ${
                          assignedCount > 0
                            ? "bg-emerald-500"
                            : "bg-slate-200 group-hover:bg-indigo-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1 flex flex-col justify-center gap-0">
                        <div className="flex items-center gap-1.5">
                          <div className="font-semibold text-slate-900 truncate text-[11px]">{label}</div>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {typeLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0">
                          {sub && <span className="text-[10px] text-slate-500 truncate">{sub}</span>}
                          <span className="text-[10px] text-slate-500">
                            AMs: <span className={`font-semibold ${assignedCount > 0 ? "text-emerald-600" : "text-slate-600"}`}>{assignedCount}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0 items-center">
                        <button
                          type="button"
                          onClick={async () => {
                            const storeInternalId =
                              r.kind === "child" ? r.store_internal_id : null;
                            setSelectedParentId(r.parent_id);
                            setSelectedTarget(r);
                            setSelectedAreaManagerIds([]);
                            setAssignMessage(null);
                            setConfirmingOverwrite(false);
                            await Promise.all([
                              loadAssignedForParent(r.parent_id, storeInternalId),
                              loadChildStores(r.parent_id),
                            ]);
                          }}
                          className="inline-flex items-center justify-center rounded-md border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          View AMs
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const storeInternalId =
                              r.kind === "child" ? r.store_internal_id : null;
                            setSelectedParentId(r.parent_id);
                            setSelectedTarget(r);
                            setSelectedAreaManagerIds([]);
                            setAssignMessage(null);
                            setConfirmingOverwrite(false);
                            await Promise.all([
                              loadAssignedForParent(r.parent_id, storeInternalId),
                              loadChildStores(r.parent_id),
                            ]);
                          }}
                          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-700 cursor-pointer"
                        >
                          Assign AM
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Separate Child Stores card – show when parent or a child is selected (list stays visible) */}
            {(selectedTarget?.kind === "parent" || selectedTarget?.kind === "child") && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-xs font-semibold text-slate-800">Child Stores</span>
                  <span className="text-[10px] text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-md">
                    Total: <span className="font-mono font-semibold text-slate-700">{childStores.length}</span>
                  </span>
                </div>
                {childStoresLoading && (
                  <div className="flex items-center gap-2 py-3 px-3 text-[11px] text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                    <span>Loading…</span>
                  </div>
                )}
                {!childStoresLoading && childStoresError && (
                  <p className="text-[11px] text-red-600 py-2 px-3">{childStoresError}</p>
                )}
                {!childStoresLoading && !childStoresError && childStores.length === 0 && (
                  <p className="text-[11px] text-slate-500 py-2 px-3">No child stores.</p>
                )}
                {!childStoresLoading && !childStoresError && childStores.length > 0 && (
                  <div
                    className="overflow-y-auto overflow-x-hidden overscroll-contain border-t border-slate-100"
                    style={{
                      maxHeight: "15rem",
                      minHeight: "5rem",
                      scrollbarGutter: "stable",
                    }}
                  >
                    {/* Column titles */}
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 mx-1 border-b border-slate-200 bg-slate-50/80 text-[10px] font-semibold text-slate-600 uppercase tracking-wide sticky top-0 z-10 shrink-0">
                      <span className="min-w-0 flex-1">Store&apos;s Name</span>
                      <span className="text-right min-w-[80px]">Assigned AMs</span>
                    </div>
                    <div className="py-0.5">
                    {childStores.map((cs) => {
                      const isActiveChild = selectedTarget?.kind === "child" && selectedTarget.store_internal_id === cs.store_internal_id;
                      return (
                        <div
                          key={cs.store_internal_id}
                          className={`flex items-center justify-between gap-2 text-[10px] cursor-pointer rounded-md px-3 py-1.5 mx-1 transition-colors border-b border-slate-50 last:border-b-0 min-h-[2.5rem] ${
                            isActiveChild
                              ? "bg-indigo-100 ring-1 ring-indigo-300 font-medium"
                              : "hover:bg-indigo-50/70"
                          }`}
                          onClick={async () => {
                            if (!selectedTarget) return;
                            const nextTarget: SearchResult = {
                              kind: "child",
                              parent_id: selectedTarget.parent_id,
                              store_internal_id: cs.store_internal_id,
                              store_id: cs.store_id,
                              parent_merchant_id: selectedTarget.parent_merchant_id,
                              store_name: cs.store_name || cs.store_id,
                              city: cs.city,
                              assigned_ams_count: selectedTarget.assigned_ams_count ?? 0,
                              store_direct_am_id: cs.area_manager_id,
                            };
                            setSelectedTarget(nextTarget);
                            setSelectedParentId(nextTarget.parent_id);
                            setSelectedAreaManagerIds([]);
                            setAssignMessage(null);
                            setConfirmingOverwrite(false);
                            await Promise.all([
                              loadAssignedForParent(nextTarget.parent_id, nextTarget.store_internal_id),
                              loadHistory(nextTarget.parent_id, nextTarget.store_internal_id),
                            ]);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className={`truncate font-medium ${isActiveChild ? "text-indigo-900" : "text-slate-700"}`}>
                              {cs.store_name || cs.store_id}
                            </p>
                            <p className="truncate text-[10px] text-slate-500 mt-0.5">
                              {cs.store_id}
                              {cs.city ? ` · ${cs.city}` : ""}
                            </p>
                          </div>
                          <span className="truncate text-slate-500 text-right min-w-[80px] text-[10px]">
                            {cs.area_manager_id
                              ? cs.area_manager_name ||
                                cs.area_manager_email ||
                                `AM #${cs.area_manager_id}`
                              : "No AM"}
                          </span>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right panel: selection + warning + AM list / empty state */}
          <div className="space-y-3">
            {!selectedTarget && (
              <div className="h-full rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-6 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold text-slate-800">
                  Select a Parent or Child Store from the left to manage Area Managers.
                </p>
                <p className="mt-1 text-[11px] text-slate-500 max-w-xs">
                  Use the buttons in the results list to view existing assignments or start assigning
                  Area Managers.
                </p>
              </div>
            )}

            {selectedTarget && (
              <div className="space-y-3">
                {/* Top: target summary – horizontal layout */}
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                  <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Current target</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-semibold text-slate-900">
                      {selectedTarget.kind === "parent"
                        ? selectedTarget.parent_name
                        : selectedTarget.store_name}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-600">
                      {selectedTarget.kind === "parent"
                        ? selectedTarget.parent_merchant_id
                        : selectedTarget.store_id}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">
                      Parent ID <span className="font-mono font-semibold text-slate-700">{selectedTarget.parent_id}</span>
                    </span>
                  </div>
                </div>

            {/* Selection + warning + AM list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-800">Select Area Managers</h3>
                  <p className="text-[11px] text-slate-500">
                    Search and select one or more Area Managers to assign to this store.
                  </p>
                </div>
                {selectedParentId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedParentId) return;
                      setHistoryOpen(true);
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-slate-300 px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Overall History
                  </button>
                )}
              </div>

              {/* Existing assignments */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 shadow-sm flex gap-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-amber-500" />
                <div className="flex-1">
                  <p className="text-[11px] text-amber-800 font-medium">
                    Existing assignment warning
                  </p>
                  {assignedLoading && (
                    <p className="mt-1 text-[11px] text-amber-800">
                      Checking existing Area Manager assignments…
                    </p>
                  )}
                  {!assignedLoading && (
                    <>
                      {assignedForSelected.length > 0 ? (
                        <div className="mt-1 space-y-1.5">
                          <p className="text-[11px] text-amber-800">
                            This store already has assigned Area Managers. If you assign new Area
                            Managers, the existing assignments will be replaced. Please confirm
                            before proceeding. You will be responsible for this change.
                          </p>
                          <ul className="text-[11px] text-amber-900 list-none space-y-0.5">
                            {assignedForSelected.map((am) => (
                              <li
                                key={am.id}
                                className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-amber-100/80"
                              >
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium">
                                    {am.full_name || am.email || `AM #${am.id}`}{" "}
                                  </span>
                                  <span className="text-amber-700">
                                    ({am.email || "No email"}
                                    {am.mobile ? ` · ${am.mobile}` : ""})
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRemoveTargetAm(am);
                                    setRemoveReason("");
                                    setConfirmModalMode("remove");
                                    setConfirmModalOpen(true);
                                  }}
                                  className="inline-flex items-center justify-center rounded-full border border-red-400 px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-600 hover:text-white cursor-pointer"
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-amber-800">
                          No Area Managers are currently assigned to this store.
                        </p>
                      )}
                    </>
                  )}
                  {assignedError && (
                    <p className="mt-1 text-[11px] text-red-600">{assignedError}</p>
                  )}
                </div>
              </div>

              {/* Area Manager search + list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={areaManagerSearch}
                      onChange={(e) => setAreaManagerSearch(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Search Area Manager by name, email, or phone"
                    />
                  </div>
                  {areaManagersLoading && (
                    <span className="text-[11px] text-slate-500">Loading Area Managers…</span>
                  )}
                </div>

                {areaManagersError && <p className="text-xs text-red-600">{areaManagersError}</p>}
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200/80 bg-white">
                  {!areaManagersLoading && filteredAreaManagers.length === 0 && (
                    <p className="px-3 py-4 text-xs text-slate-500">No Area Managers found.</p>
                  )}
                  {filteredAreaManagers.map((am) => {
                    const checked = selectedAreaManagerIds.includes(am.id);
                    return (
                      <label
                        key={am.id}
                        className={`flex items-center gap-2 px-3 py-2 text-xs border-b border-slate-200/70 last:border-b-0 cursor-pointer ${
                          checked ? "bg-indigo-50/60" : "hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAreaManager(am.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {am.full_name || am.email || `AM #${am.id}`}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {am.email || "No email"}
                            {am.mobile ? ` · ${am.mobile}` : ""}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {assignMessage && (
                  <p
                    className={`text-xs ${
                      assignMessage.toLowerCase().includes("success")
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {assignMessage}
                  </p>
                )}

                <div className="flex justify-between items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTarget(null);
                      setSelectedParentId(null);
                      setSelectedAreaManagerIds([]);
                      setAssignedForSelected([]);
                      setAssignedError(null);
                      setAssignMessage(null);
                      setConfirmingOverwrite(false);
                    }}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Close Selection
                  </button>
                  <button
                    type="button"
                    disabled={
                      !selectedParentId || !selectedAreaManagerIds.length || assigning || assignedLoading
                    }
                    onClick={handleAssign}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
                  >
                    {assigning
                      ? "Assigning…"
                      : confirmingOverwrite && assignedForSelected.length > 0
                      ? "Confirm & Assign"
                      : "Assign Area Managers"}
                  </button>
                </div>
              </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const confirmationModal = !confirmModalOpen ? null : (
    <div className="fixed inset-0 z-[2600] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 h-2 w-2 rounded-full bg-amber-500" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900">
              {confirmModalMode === "remove"
                ? "Remove Area Manager?"
                : "Replace existing Area Managers?"}
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              {confirmModalMode === "remove"
                ? "This will unassign the selected Area Manager from this parent/store. Store access and reports will update immediately."
                : "Assigning new Area Managers will replace the existing assignments for this parent/store. Store access and reports will update immediately."}
            </p>
            <p className="mt-1 text-[11px] text-amber-800">
              Please review carefully before confirming. This action can impact which Area
              Manager is responsible for this merchant&apos;s stores.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 pt-1">
          {confirmModalMode === "remove" ? (
            <>
              <label className="text-[11px] text-slate-700">
                Removal reason (optional)
              </label>
              <textarea
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Why are you removing this Area Manager from this store?"
              />
              <div className="flex justify-end gap-2">
                    <button
                  type="button"
                  onClick={() => {
                    if (removing) return;
                    setConfirmModalOpen(false);
                    setConfirmModalMode(null);
                    setRemoveTargetAm(null);
                    setRemoveReason("");
                  }}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                    <button
                  type="button"
                  onClick={handleRemoveAreaManager}
                  disabled={removing}
                      className="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60 cursor-pointer"
                >
                  {removing ? "Removing…" : "Confirm Remove"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (assigning) return;
                  setConfirmModalOpen(false);
                  setConfirmModalMode(null);
                }}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOverwrite}
                disabled={assigning}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
              >
                {assigning ? "Assigning…" : "Confirm & Assign"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!asModal) {
    return (
      <div className="w-full py-2 relative">
        {content}
        {confirmationModal}
        {historyOpen && (
          <div className="fixed inset-0 z-[2550] flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Area Manager History
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    Recent assignments and removals for this store/parent.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="border border-slate-200 rounded-lg max-h-72 overflow-y-auto px-3 py-2 bg-slate-50/60">
                {historyLoading && (
                  <p className="text-[11px] text-slate-500">Loading history…</p>
                )}
                {!historyLoading && historyError && (
                  <p className="text-[11px] text-red-600">{historyError}</p>
                )}
                {!historyLoading && !historyError && historyItems.length === 0 && (
                  <p className="text-[11px] text-slate-500">
                    No history recorded for this store/parent yet.
                  </p>
                )}
                {!historyLoading && !historyError && historyItems.length > 0 && (
                  <ul className="space-y-1.5 text-[11px] text-slate-700">
                    {historyItems.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-md bg-white px-2 py-1.5 border border-slate-200"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={
                              item.action === "ASSIGN"
                                ? "text-emerald-700 font-semibold"
                                : "text-red-700 font-semibold"
                            }
                          >
                            {item.action === "ASSIGN" ? "Assigned" : "Removed"}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(item.acted_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-700">
                          AM:{" "}
                          <span className="font-medium">
                            {item.area_manager_name ||
                              item.area_manager_email ||
                              "Unknown AM"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          By:{" "}
                          {item.actor_name || item.actor_email || "System / Unknown"}
                        </div>
                        {item.reason && (
                          <div className="mt-0.5 text-[10px] text-slate-600">
                            Reason: {item.reason}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/40">
      {content}
      {confirmationModal}
      {historyOpen && (
        <div className="fixed inset-0 z-[2550] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Area Manager History
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Recent assignments and removals for this store/parent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg max-h-72 overflow-y-auto px-3 py-2 bg-slate-50/60">
              {historyLoading && (
                <p className="text-[11px] text-slate-500">Loading history…</p>
              )}
              {!historyLoading && historyError && (
                <p className="text-[11px] text-red-600">{historyError}</p>
              )}
              {!historyLoading && !historyError && historyItems.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  No history recorded for this store/parent yet.
                </p>
              )}
              {!historyLoading && !historyError && historyItems.length > 0 && (
                <ul className="space-y-1.5 text-[11px] text-slate-700">
                  {historyItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md bg-white px-2 py-1.5 border border-slate-200"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={
                            item.action === "ASSIGN"
                              ? "text-emerald-700 font-semibold"
                              : "text-red-700 font-semibold"
                          }
                        >
                          {item.action === "ASSIGN" ? "Assigned" : "Removed"}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(item.acted_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-700">
                        AM:{" "}
                        <span className="font-medium">
                          {item.area_manager_name ||
                            item.area_manager_email ||
                            "Unknown AM"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        By:{" "}
                        {item.actor_name || item.actor_email || "System / Unknown"}
                      </div>
                      {item.reason && (
                        <div className="mt-0.5 text-[10px] text-slate-600">
                          Reason: {item.reason}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


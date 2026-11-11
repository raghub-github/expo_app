"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { X, Search, Loader2 } from "lucide-react";
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
  /** Formatted system user id (system_users.system_user_id) */
  system_user_id: string | null;
  email: string | null;
  mobile: string | null;
  city: string | null;
  locality_code: string | null;
  primary_role: string | null;
};

function isSuperAdminRole(role: string | null | undefined) {
  return (role ?? "").toUpperCase() === "SUPER_ADMIN";
}

type AssignedAreaManagerInfo = AreaManagerListItem;

function amPrimaryLabel(am: { id: number; full_name: string | null }) {
  const name = am.full_name?.trim();
  if (name) return name;
  return `AM #${am.id}`;
}

function amLocationLine(am: { city: string | null; locality_code: string | null }) {
  const parts: string[] = [];
  const city = am.city?.trim();
  const locality = am.locality_code?.trim();
  if (city) parts.push(city);
  if (locality) parts.push(locality);
  return parts.join(" · ");
}

function amContactLine(am: { email: string | null; mobile: string | null }) {
  const parts: string[] = [];
  const email = am.email?.trim();
  const mobile = am.mobile?.trim();
  if (email) parts.push(email);
  if (mobile) parts.push(mobile);
  return parts.join(" · ");
}

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
  const searchParams = useAppSearchParams();
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
        const res = await fetch(
          "/api/area-manager/list?type=MERCHANT&limit=100&includeSuperAdmins=1"
        );
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
            // API returns camelCase (fullName); accept snake_case too
            full_name: (am.fullName as string) ?? (am.full_name as string) ?? null,
            system_user_id:
              (am.systemUserId as string) ?? (am.system_user_id as string) ?? null,
            email: (am.email as string) ?? null,
            mobile: (am.mobile as string) ?? null,
            city: (am.city as string) ?? null,
            locality_code:
              (am.localityCode as string) ?? (am.locality_code as string) ?? null,
            primary_role:
              (am.primaryRole as string) ?? (am.primary_role as string) ?? null,
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
  const setAssignAmLoadingRef = useRef(merchantsSearch?.setAssignAmSearchLoading);
  setAssignAmLoadingRef.current = merchantsSearch?.setAssignAmSearchLoading;

  useEffect(() => {
    if (!isOpen) return;

    // Empty input / no ?search= → never call search API; clear spinner + stale results
    if (!urlSearch) {
      setSearchLoading(false);
      setSearchError(null);
      setSearchResults([]);
      setSearchQuery("");
      setAssignAmLoadingRef.current?.(false);
      return;
    }

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
    setAssignAmLoadingRef.current?.(true);

    const ac = new AbortController();
    const params = new URLSearchParams({ q: urlSearch, limit: "20" });
    fetch(`/api/admin/parent-area-managers/search?${params.toString()}`, { signal: ac.signal })
      .then((res) => res.json())
      .then((json) => {
        if (ac.signal.aborted) return;
        if (!json?.success) {
          setSearchError(json?.error || "Search failed");
          setSearchResults([]);
          return;
        }
        setSearchResults((json.results ?? []) as SearchResult[]);
      })
      .catch((err) => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setSearchError("Search failed");
        setSearchResults([]);
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setSearchLoading(false);
        setAssignAmLoadingRef.current?.(false);
      });

    return () => {
      ac.abort();
    };
  }, [isOpen, urlSearch]);

  const filteredAreaManagers = useMemo(() => {
    const term = areaManagerSearch.trim().toLowerCase();
    if (!term) return areaManagers;
    return areaManagers.filter((am) => {
      const name = am.full_name ?? "";
      const systemId = am.system_user_id ?? "";
      const email = am.email ?? "";
      const mobile = am.mobile ?? "";
      const city = am.city ?? "";
      const locality = am.locality_code ?? "";
      return (
        name.toLowerCase().includes(term) ||
        systemId.toLowerCase().includes(term) ||
        email.toLowerCase().includes(term) ||
        mobile.toLowerCase().includes(term) ||
        city.toLowerCase().includes(term) ||
        locality.toLowerCase().includes(term)
      );
    });
  }, [areaManagers, areaManagerSearch]);

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
      const items = ((json.items as any[]) ?? []).map((am) => ({
        id: Number(am.id),
        full_name: (am.full_name as string) ?? null,
        system_user_id: (am.system_user_id as string) ?? null,
        email: (am.email as string) ?? null,
        mobile: (am.mobile as string) ?? null,
        city: (am.city as string) ?? null,
        locality_code: (am.locality_code as string) ?? null,
        primary_role: (am.primary_role as string) ?? null,
      }));
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

  const content = (
    <div className="w-full bg-white">
      {asModal ? (
        <div className="flex items-center justify-between border-b border-[#121212]/08 px-4 py-3">
          <h2 className="text-sm font-semibold text-[#121212]">Assign AM to Stores</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[#121212]/50 hover:bg-[#121212]/05"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Main two-panel area */}
      <div className={asModal ? "px-4 py-3" : "py-1"}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Left panel: Search results */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#121212]">Search Results</h3>
              {searchQuery ? (
                <span className="rounded-md bg-[#F4F4F4] px-2 py-0.5 font-mono text-[11px] uppercase text-[#121212]/55">
                  {searchQuery}
                </span>
              ) : null}
            </div>
            {searchError && <p className="text-xs text-red-600">{searchError}</p>}
            <div className="flex max-h-72 min-h-0 flex-col overflow-y-auto rounded-md border border-[#121212]/12 bg-white">
              {searchLoading && (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#121212]/40" />
                  <p className="text-xs text-[#121212]/50">Searching…</p>
                </div>
              )}
              {!searchLoading && searchResults.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-[#121212]/50">
                  {searchQuery
                    ? `No merchants found for “${searchQuery}”.`
                    : "No results yet. Search from the header."}
                </p>
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
                      className={`flex items-center gap-2 border-b-[0.5px] border-[#121212]/10 px-3 py-2.5 text-xs last:border-b-0 ${
                        isSelected ? "bg-[#F3F7FA]" : "bg-white hover:bg-[#FAFAFA]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-[12px] font-semibold text-[#121212]">{label}</p>
                          <span className="shrink-0 rounded bg-[#F4F4F4] px-1.5 py-0.5 text-[10px] font-medium text-[#121212]/55">
                            {typeLabel}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#121212]/50">
                          {sub ? <span className="truncate">{sub}</span> : null}
                          <span>
                            AMs:{" "}
                            <span className="font-semibold text-[#121212]/70">{assignedCount}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
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
                          className="inline-flex h-7 cursor-pointer items-center justify-center rounded-md border border-sky-500 bg-sky-50 px-2.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
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
                          className="inline-flex h-7 cursor-pointer items-center justify-center rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
                        >
                          Assign AM
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Child Stores list */}
            {(selectedTarget?.kind === "parent" || selectedTarget?.kind === "child") && (
              <div className="overflow-hidden rounded-md border border-[#121212]/12 bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-[#121212]/08 px-3 py-2">
                  <span className="text-xs font-semibold text-[#121212]">Child Stores</span>
                  <span className="text-[10px] text-[#121212]/50">
                    Total: <span className="font-semibold text-[#121212]">{childStores.length}</span>
                  </span>
                </div>
                {childStoresLoading && (
                  <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-[#121212]/50">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#121212]/35" />
                    <span>Loading…</span>
                  </div>
                )}
                {!childStoresLoading && childStoresError && (
                  <p className="px-3 py-2 text-[11px] text-red-600">{childStoresError}</p>
                )}
                {!childStoresLoading && !childStoresError && childStores.length === 0 && (
                  <p className="px-3 py-2 text-[11px] text-[#121212]/50">No child stores.</p>
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
                    <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b-[0.5px] border-[#121212]/12 bg-[#F7F7F7] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#121212]/50">
                      <span className="min-w-0 flex-1">Store&apos;s Name</span>
                      <span className="min-w-[80px] text-right">Assigned AMs</span>
                    </div>
                    <div>
                    {childStores.map((cs) => {
                      const isActiveChild = selectedTarget?.kind === "child" && selectedTarget.store_internal_id === cs.store_internal_id;
                      return (
                        <div
                          key={cs.store_internal_id}
                          className={`flex min-h-[2.5rem] cursor-pointer items-center justify-between gap-2 border-b-[0.5px] border-[#121212]/10 px-3 py-1.5 text-[12px] last:border-b-0 ${
                            isActiveChild
                              ? "bg-[#F3F7FA] font-medium"
                              : "hover:bg-[#FAFAFA]"
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
                            <p className={`truncate font-medium ${isActiveChild ? "text-[#121212]" : "text-[#121212]/80"}`}>
                              {cs.store_name || cs.store_id}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-[#121212]/45">
                              {cs.store_id}
                              {cs.city ? ` · ${cs.city}` : ""}
                            </p>
                          </div>
                          <span className="min-w-[80px] truncate text-right text-[10px] text-[#121212]/50">
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

          {/* Right panel */}
          <div className="space-y-3">
            {!selectedTarget && (
              <div className="flex h-full min-h-[12rem] flex-col items-center justify-center rounded-md border border-[#121212]/10 bg-[#FAFAFA] px-4 py-8 text-center">
                <p className="text-xs font-medium text-[#121212]/70">
                  Select a store from search results to assign Area Managers.
                </p>
              </div>
            )}

            {selectedTarget && (
              <div className="space-y-3">
                <div className="rounded-md border-[0.5px] border-[#121212]/12 bg-white px-3 py-2.5">
                  <p className="mb-1 text-[11px] font-medium text-[#121212]/45">Current target</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                    <span className="font-semibold text-[#121212]">
                      {selectedTarget.kind === "parent"
                        ? selectedTarget.parent_name
                        : selectedTarget.store_name}
                    </span>
                    <span className="text-[#121212]/30">·</span>
                    <span className="font-mono text-[12px] text-[#121212]/60">
                      {selectedTarget.kind === "parent"
                        ? selectedTarget.parent_merchant_id
                        : selectedTarget.store_id}
                    </span>
                    <span className="text-[#121212]/30">·</span>
                    <span className="text-[12px] text-[#121212]/50">
                      Parent ID{" "}
                      <span className="font-mono font-semibold text-[#121212]">
                        {selectedTarget.parent_merchant_id}
                      </span>
                    </span>
                  </div>
                </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-[#121212]">Select Area Managers</h3>
                {selectedParentId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedParentId) return;
                      setHistoryOpen(true);
                    }}
                    className="inline-flex cursor-pointer items-center justify-center rounded-md border border-[#121212]/15 px-2.5 py-1 text-[10px] font-medium text-[#121212] hover:bg-[#F7F7F7]"
                  >
                    Overall History
                  </button>
                )}
              </div>

              {/* Existing assignments — single-row layout */}
              <div className="rounded-md border-[0.5px] border-[#121212]/12 bg-[#FAFAFA] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-[#121212]/70">Current assignments</p>
                  {assignedForSelected.length > 0 ? (
                    <p className="text-[10px] text-[#121212]/40">
                      New assign replaces existing after confirmation
                    </p>
                  ) : null}
                </div>
                {assignedLoading && (
                  <p className="mt-1.5 text-[11px] text-[#121212]/50">Checking…</p>
                )}
                {!assignedLoading && (
                  <>
                    {assignedForSelected.length > 0 ? (
                      <ul className="mt-1.5 divide-y divide-[#121212]/08">
                        {assignedForSelected.map((am) => {
                          const location = amLocationLine(am);
                          const contact = amContactLine(am);
                          return (
                            <li
                              key={am.id}
                              className="flex items-center gap-2 py-1.5 first:pt-1 last:pb-0"
                            >
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                                <span className="truncate font-medium text-[#121212]">
                                  {amPrimaryLabel(am)}
                                </span>
                                {isSuperAdminRole(am.primary_role) ? (
                                  <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-700">
                                    Super Admin
                                  </span>
                                ) : null}
                                {am.system_user_id ? (
                                  <span className="truncate font-mono text-[10px] uppercase text-[#121212]/45">
                                    {am.system_user_id}
                                  </span>
                                ) : null}
                                {location ? (
                                  <span className="truncate text-[11px] text-[#121212]/45">
                                    · {location}
                                  </span>
                                ) : null}
                                {contact ? (
                                  <span className="min-w-0 truncate text-[11px] text-[#121212]/40">
                                    · {contact}
                                  </span>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setRemoveTargetAm(am);
                                  setRemoveReason("");
                                  setConfirmModalMode("remove");
                                  setConfirmModalOpen(true);
                                }}
                                className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-[#121212]/50">
                        No Area Managers assigned yet.
                      </p>
                    )}
                  </>
                )}
                {assignedError && (
                  <p className="mt-1 text-[11px] text-red-600">{assignedError}</p>
                )}
              </div>

              {/* Area Manager search + list */}
              <div className="space-y-2">
                <div className="relative max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
                  <input
                    type="text"
                    value={areaManagerSearch}
                    onChange={(e) => setAreaManagerSearch(e.target.value)}
                    className="h-9 w-full rounded-md border border-[#121212]/15 bg-white pl-8 pr-2 text-xs text-[#121212] placeholder:text-[#121212]/40 focus:border-[#121212]/35 focus:outline-none"
                    placeholder="Search by name, ID, email, or phone"
                  />
                </div>
                {areaManagersLoading && (
                  <p className="text-[11px] text-[#121212]/45">Loading Area Managers…</p>
                )}
                {areaManagersError && <p className="text-xs text-red-600">{areaManagersError}</p>}
                <div className="max-h-64 overflow-y-auto rounded-md border-[0.5px] border-[#121212]/12 bg-white">
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b-[0.5px] border-[#121212]/12 bg-[#F7F7F7] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
                    <span className="w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-[1.3]">Name / ID</span>
                    <span className="min-w-0 flex-[1]">City / Locality</span>
                    <span className="min-w-0 flex-[1.2]">Email / Phone</span>
                  </div>
                  {!areaManagersLoading && filteredAreaManagers.length === 0 && (
                    <p className="px-3 py-6 text-center text-xs text-[#121212]/50">
                      No Area Managers found.
                    </p>
                  )}
                  {filteredAreaManagers.map((am) => {
                    const checked = selectedAreaManagerIds.includes(am.id);
                    const location = amLocationLine(am);
                    const contact = amContactLine(am);
                    const superAdmin = isSuperAdminRole(am.primary_role);
                    return (
                      <label
                        key={am.id}
                        className={`flex cursor-pointer items-center gap-2 border-b-[0.5px] border-[#121212]/10 px-3 py-2.5 last:border-b-0 ${
                          checked ? "bg-[#F3F7FA]" : "hover:bg-[#FAFAFA]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAreaManager(am.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-[#121212]/25 text-emerald-600 focus:ring-emerald-500/30"
                        />
                        <span className="min-w-0 flex-[1.3]">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-[#121212]">
                              {amPrimaryLabel(am)}
                            </span>
                            {superAdmin ? (
                              <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-700">
                                Super Admin
                              </span>
                            ) : null}
                          </span>
                          {am.system_user_id ? (
                            <span className="mt-0.5 block truncate font-mono text-[10px] font-normal uppercase text-[#121212]/45">
                              {am.system_user_id}
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-[1] truncate text-[12px] font-normal text-[#121212]/45">
                          {location || "—"}
                        </span>
                        <span className="min-w-0 flex-[1.2] truncate text-[12px] font-normal text-[#121212]/40">
                          {contact || "—"}
                        </span>
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

                <div className="flex items-center justify-between gap-2 pt-1">
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
                    className="inline-flex cursor-pointer items-center justify-center rounded-md border border-[#121212]/15 px-3 py-1.5 text-xs font-medium text-[#121212] hover:bg-[#F7F7F7]"
                  >
                    Close Selection
                  </button>
                  <button
                    type="button"
                    disabled={
                      !selectedParentId || !selectedAreaManagerIds.length || assigning || assignedLoading
                    }
                    onClick={handleAssign}
                    className="inline-flex cursor-pointer items-center justify-center rounded-md bg-[#121212] px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
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
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-[#121212] px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-60"
              >
                {assigning ? "Assigning…" : "Confirm & Assign"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const historySidesheet = !historyOpen ? null : (
    <div className="fixed inset-0 z-[2550] flex justify-end">
      <button
        type="button"
        aria-label="Close history overlay"
        className="absolute inset-0 cursor-pointer bg-black/30"
        onClick={() => setHistoryOpen(false)}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-[#121212]/10 bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#121212]/08 px-4 py-3">
          <div>
            <h3 className="text-[15px] font-semibold text-[#121212]">Area Manager History</h3>
            <p className="mt-0.5 text-[12px] text-[#121212]/50">
              Recent assignments and removals for this store/parent.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen(false)}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[#121212]/12 text-[#121212]/55 hover:bg-[#F7F7F7]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {historyLoading && (
            <p className="text-[12px] text-[#121212]/50">Loading history…</p>
          )}
          {!historyLoading && historyError && (
            <p className="text-[12px] text-red-600">{historyError}</p>
          )}
          {!historyLoading && !historyError && historyItems.length === 0 && (
            <p className="rounded-md border-[0.5px] border-[#121212]/10 bg-[#FAFAFA] px-3 py-6 text-center text-[12px] text-[#121212]/50">
              No history recorded for this store/parent yet.
            </p>
          )}
          {!historyLoading && !historyError && historyItems.length > 0 && (
            <ul className="space-y-2">
              {historyItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border-[0.5px] border-[#121212]/12 bg-white px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[12px] font-semibold ${
                        item.action === "ASSIGN" ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {item.action === "ASSIGN" ? "Assigned" : "Removed"}
                    </span>
                    <span className="text-[11px] text-[#121212]/45">
                      {new Date(item.acted_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] font-medium text-[#121212]">
                    {item.area_manager_name || item.area_manager_email || "Unknown AM"}
                  </p>
                  {item.area_manager_name && item.area_manager_email ? (
                    <p className="mt-0.5 text-[12px] text-[#121212]/40">{item.area_manager_email}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-[#121212]/45">
                    By: {item.actor_name || item.actor_email || "System / Unknown"}
                  </p>
                  {item.reason ? (
                    <p className="mt-0.5 text-[11px] text-[#121212]/55">Reason: {item.reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );

  if (!asModal) {
    return (
      <div className="relative w-full py-2">
        {content}
        {confirmationModal}
        {historySidesheet}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/40">
      {content}
      {confirmationModal}
      {historySidesheet}
    </div>
  );
}


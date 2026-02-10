"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  ChevronRight,
  AlertCircle,
  Building2,
  Building,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useUrlFilters } from "@/hooks/useUrlFilters";

type TabStatus = "VERIFIED" | "PENDING" | "REJECTED" | "ALL";
type StoreFilter = "all" | "parent" | "child";

interface StoreItem {
  id: number;
  storeId: string;
  name: string;
  ownerPhone: string;
  status: string;
  localityCode: string | null;
  areaCode: string | null;
  parentStoreId: number | null;
  createdAt: string;
  isParent?: boolean;
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
        validValues: ["ALL", "VERIFIED", "PENDING", "REJECTED"] as const,
      },
      filter: {
        paramName: "filter",
        defaultValue: "all",
        validValues: ["all", "parent", "child"] as const,
      },
    },
  });

  const statusTab = (urlFilters.status as TabStatus) || "ALL";
  const storeFilter = (urlFilters.filter as StoreFilter) || "all";

  // Get parentId from URL (not managed by useUrlFilters as it's conditional)
  const parentIdParam = searchParams.get("parentId");
  const selectedParentId = parentIdParam ? parseInt(parentIdParam, 10) : null;

  const [items, setItems] = useState<StoreItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Fetch data - uses URL params as single source of truth
  const fetchList = useCallback(
    async (cursor?: string) => {
      if (!filtersInitialized) return;

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();

        // Use URL params directly
        const urlStatus = searchParams.get("status");
        const urlFilter = searchParams.get("filter");
        const urlParentId = searchParams.get("parentId");
        const urlSearch = searchParams.get("search");

        if (urlStatus && urlStatus !== "ALL") params.set("status", urlStatus);
        if (urlFilter && urlFilter !== "all") params.set("filter", urlFilter);
        if (urlParentId) params.set("parentId", urlParentId);
        if (urlSearch?.trim()) params.set("search", urlSearch.trim());

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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [searchParams, filtersInitialized]
  );

  // Fetch when filters are initialized or URL changes
  useEffect(() => {
    if (filtersInitialized) {
      fetchList();
    }
  }, [fetchList, filtersInitialized]);

  // Handle parent click - navigate to child stores view
  const handleParentClick = (parentId: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("parentId", String(parentId));
    params.set("filter", "child");
    // Preserve status if exists
    const statusParam = searchParams.get("status");
    if (statusParam) params.set("status", statusParam);
    router.push(`/dashboard/area-managers/stores?${params.toString()}`, {
      scroll: false,
    });
  };

  // Handle filter change (All Stores, Parent Stores, Child Stores)
  const handleFilterChange = (filter: StoreFilter) => {
    updateFilters({
      filter: filter === "all" ? null : filter,
    });
    // Remove parentId when changing filter
    if (filter !== "child" || !selectedParentId) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("parentId");
      if (filter !== "all") params.set("filter", filter);
      router.push(`/dashboard/area-managers/stores?${params.toString()}`, {
        scroll: false,
      });
    }
  };

  // Handle status tab change
  const handleStatusChange = (status: TabStatus) => {
    updateFilters({
      status: status === "ALL" ? null : status,
    });
  };

  const tabs: { key: TabStatus; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "VERIFIED", label: "Verified" },
    { key: "PENDING", label: "Pending" },
    { key: "REJECTED", label: "Rejected" },
  ];

  // Determine effective filter for UI (child when parentId is set)
  const effectiveFilter: StoreFilter =
    selectedParentId != null ? "child" : storeFilter;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Stores</h2>
        <div className="flex flex-wrap items-center gap-2">
          {selectedParentId == null && storeFilter !== "parent" && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Store
            </button>
          )}
        </div>
      </div>

      {/* Parent/Child Filter Buttons */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => handleFilterChange("all")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            effectiveFilter === "all"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          All Stores
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange("parent")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            effectiveFilter === "parent"
              ? "bg-purple-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Parent Stores
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange("child")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            effectiveFilter === "child"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          <Building className="h-4 w-4" />
          Child Stores
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleStatusChange(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              statusTab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

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
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No stores found. Add a store or adjust filters.
        </div>
      ) : (
        <>
          {/* Header for child stores view */}
          {selectedParentId != null && (
            <div className="flex items-center justify-between mb-4 rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Child Stores for Parent ID: {selectedParentId}
              </h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Child Store
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    // Preserve status filter
                    const statusParam = searchParams.get("status");
                    if (statusParam) params.set("status", statusParam);
                    params.delete("parentId");
                    router.push(`/dashboard/area-managers/stores?${params.toString()}`, {
                      scroll: false,
                    });
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Empty state for child stores */}
          {selectedParentId != null && items.length === 0 && !loading && (
            <div className="text-center py-8 rounded-lg border border-gray-200 bg-white">
              <p className="text-gray-500 mb-4">
                No child stores found for this parent.
              </p>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add Child Store
              </button>
            </div>
          )}

          {/* Main table - shows all stores or filtered child stores */}
          {items.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Store ID
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Name
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Owner phone
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Locality
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap px-4 py-2">
                        <div className="text-sm font-medium text-gray-900">
                          {s.storeId}
                        </div>
                        {s.parentStoreId != null && !s.isParent && (
                          <div className="text-xs text-purple-600 mt-0.5">
                            Parent ID: {s.parentStoreId}
                          </div>
                        )}
                        {s.isParent && effectiveFilter === "parent" && (
                          <button
                            type="button"
                            onClick={() => handleParentClick(s.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-0.5 font-medium cursor-pointer"
                          >
                            Parent ID: {s.id} - Click to view children
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {s.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                        {s.ownerPhone || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span
                          className={`inline rounded px-2 py-0.5 text-xs font-medium ${
                            s.status === "VERIFIED"
                              ? "bg-green-100 text-green-800"
                              : s.status === "REJECTED"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                        {s.localityCode ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <Link
                          href={`/dashboard/area-managers/stores/${s.id}`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          Manage
                        </Link>
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
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
            // Refetch current list without redirecting
            fetchList();
          }}
          parentId={selectedParentId}
        />
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

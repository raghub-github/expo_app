"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Package,
  Search,
  Download,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useUrlFilter } from "@/hooks/useUrlFilters";

type TabStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "ALL";

interface RiderItem {
  id: number;
  mobile: string;
  name: string | null;
  status: string;
  localityCode: string | null;
  availabilityStatus: string;
  createdAt: string;
}

export function AreaManagerRidersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Use URL-based status filter with persistence
  const {
    value: statusTab,
    setValue: setStatusTab,
    isInitialized: statusInitialized,
  } = useUrlFilter<TabStatus>("status", "ALL", [
    "ALL",
    "ACTIVE",
    "INACTIVE",
    "BLOCKED",
  ] as const);

  // Get search and localityCode from URL (with debounce for search)
  const urlSearch = searchParams.get("search") || "";
  const urlLocalityCode = searchParams.get("localityCode") || "";

  const [items, setItems] = useState<RiderItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [localityInput, setLocalityInput] = useState(urlLocalityCode);
  const [exporting, setExporting] = useState(false);

  // Sync input fields with URL params
  useEffect(() => {
    setSearchInput(urlSearch);
    setLocalityInput(urlLocalityCode);
  }, [urlSearch, urlLocalityCode]);

  // Fetch data using URL params as single source of truth
  const fetchList = useCallback(
    async (cursor?: string) => {
      if (!statusInitialized) return;

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();

        // Use URL params directly
        const urlStatus = searchParams.get("status");
        const urlSearchParam = searchParams.get("search");
        const urlLocality = searchParams.get("localityCode");

        if (urlStatus && urlStatus !== "ALL") params.set("status", urlStatus);
        if (urlSearchParam?.trim()) params.set("search", urlSearchParam.trim());
        if (urlLocality?.trim())
          params.set("localityCode", urlLocality.trim());

        params.set("limit", "20");
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/area-manager/riders?${params}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error ?? "Failed to load riders");
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
    [searchParams, statusInitialized]
  );

  // Fetch when initialized or URL changes
  useEffect(() => {
    if (statusInitialized) {
      fetchList();
    }
  }, [fetchList, statusInitialized]);

  // Update URL with search and locality filters
  const updateSearchFilters = useCallback(
    (search: string, localityCode: string) => {
      const params = new URLSearchParams(searchParams.toString());

      // Preserve status
      const statusParam = searchParams.get("status");
      if (statusParam && statusParam !== "ALL") {
        params.set("status", statusParam);
      }

      if (search.trim()) {
        params.set("search", search.trim());
      } else {
        params.delete("search");
      }

      if (localityCode.trim()) {
        params.set("localityCode", localityCode.trim());
      } else {
        params.delete("localityCode");
      }

      router.push(`/dashboard/area-managers/riders?${params.toString()}`, {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  // Handle search submit
  const handleSearch = useCallback(() => {
    updateSearchFilters(searchInput, localityInput);
  }, [searchInput, localityInput, updateSearchFilters]);

  // Handle export
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      const urlStatus = searchParams.get("status");
      const urlSearchParam = searchParams.get("search");
      const urlLocality = searchParams.get("localityCode");

      if (urlStatus && urlStatus !== "ALL") params.set("status", urlStatus);
      if (urlSearchParam?.trim()) params.set("search", urlSearchParam.trim());
      if (urlLocality?.trim())
        params.set("localityCode", urlLocality.trim());

      const res = await fetch(`/api/area-manager/riders/export?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `riders-export-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const tabs: { key: TabStatus; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "ACTIVE", label: "Active" },
    { key: "INACTIVE", label: "Inactive" },
    { key: "BLOCKED", label: "Blocked" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Riders</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Name, phone, rider ID"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Locality"
            value={localityInput}
            onChange={(e) => setLocalityInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-32"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Search
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatusTab(t.key === "ALL" ? null : t.key)}
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
          No riders found. Adjust filters or locality.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    ID
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Phone
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Availability
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
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900">
                      {r.id}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {r.name ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                      {r.mobile}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span
                        className={`inline rounded px-2 py-0.5 text-xs font-medium ${
                          r.status === "ACTIVE"
                            ? "bg-green-100 text-green-800"
                            : r.status === "BLOCKED"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                      {r.availabilityStatus}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                      {r.localityCode ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <Link
                        href={`/dashboard/area-managers/riders/${r.id}`}
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
    </div>
  );
}

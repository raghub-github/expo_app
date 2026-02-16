"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight, AlertCircle } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useUrlFilter } from "@/hooks/useUrlFilters";

interface LogItem {
  id: number;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: number;
  createdAt: string;
}

export function AreaManagerActivityLogsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Use URL-based entity type filter with persistence
  const {
    value: entityType,
    setValue: setEntityType,
    isInitialized: filterInitialized,
  } = useUrlFilter<string>("entityType", "", ["", "store", "rider"] as const);

  const [items, setItems] = useState<LogItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data using URL params as single source of truth
  const fetchList = useCallback(
    async (cursor?: string) => {
      if (!filterInitialized) return;

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");

        // Use URL param directly
        const urlEntityType = searchParams.get("entityType");
        if (urlEntityType?.trim()) {
          params.set("entityType", urlEntityType.trim());
        }

        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/area-manager/activity-logs?${params}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error ?? "Failed to load activity logs");
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
    [searchParams, filterInitialized]
  );

  // Fetch when initialized or URL changes
  useEffect(() => {
    if (filterInitialized) {
      fetchList();
    }
  }, [fetchList, filterInitialized]);

  // Handle entity type change
  const handleEntityTypeChange = (value: string) => {
    setEntityType(value === "" ? null : value);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Activity logs</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Entity type</label>
          <select
            value={entityType}
            onChange={(e) => handleEntityTypeChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="store">Store</option>
            <option value="rider">Rider</option>
          </select>
        </div>
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
          No activity logs found.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Action
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Entity
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Entity ID
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {items.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900">
                      {log.action}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                      {log.entityType}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                      {log.entityId}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextCursor && (
            <div className="flex justify-end">
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

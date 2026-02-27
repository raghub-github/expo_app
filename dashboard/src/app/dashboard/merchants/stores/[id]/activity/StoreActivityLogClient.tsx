"use client";

import { useQuery } from "@tanstack/react-query";
import { History, Loader2, User, FileEdit } from "lucide-react";

export type ActivityLogEntry = {
  id: number;
  store_id: number;
  agent_id: number | null;
  agent_email: string | null;
  changed_section: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  action_type: string;
  created_at: string;
};

async function fetchActivityLogs(storeId: string): Promise<ActivityLogEntry[]> {
  const res = await fetch(`/api/merchant/stores/${storeId}/activity-logs`, {
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok || !data.success) return [];
  return Array.isArray(data.logs) ? data.logs : [];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatFieldName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StoreActivityLogClient({ storeId }: { storeId: string }) {
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ["storeActivityLogs", storeId],
    queryFn: () => fetchActivityLogs(storeId),
    enabled: !!storeId,
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-6">
      <div className="flex items-center gap-2 mb-6">
        <History className="h-5 w-5 text-blue-600" />
        <h1 className="text-lg font-semibold text-gray-900">Activity Log</h1>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        All agent changes for this store. Latest first.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 py-4">
          Failed to load activity logs. Please try again.
        </p>
      )}

      {!isLoading && !error && logs.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">
          No activity recorded yet.
        </p>
      )}

      {!isLoading && !error && logs.length > 0 && (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  <FileEdit className="h-3 w-3" />
                  {log.changed_section}
                </span>
                <span className="font-medium text-gray-900">
                  {formatFieldName(log.field_name)}
                </span>
                {(log.agent_email || log.agent_id != null) && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700" title={log.agent_email ?? `Agent #${log.agent_id}`}>
                    <User className="h-3 w-3 shrink-0" />
                    {log.agent_email ?? `Agent #${log.agent_id}`}
                  </span>
                )}
                <span className="text-gray-400 text-xs ml-auto">
                  {formatDate(log.created_at)}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                {log.old_value != null && log.old_value !== "" && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-gray-500 shrink-0">Previous:</span>
                    <span className="text-gray-700 break-words">
                      {log.old_value.length > 200
                        ? log.old_value.slice(0, 200) + "…"
                        : log.old_value}
                    </span>
                  </span>
                )}
                {log.old_value != null && log.old_value !== "" && log.new_value != null && log.new_value !== "" && (
                  <span className="text-gray-300 shrink-0">|</span>
                )}
                {log.new_value != null && log.new_value !== "" && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-gray-500 shrink-0">Updated:</span>
                    <span className="text-gray-900 font-medium break-words">
                      {log.new_value.length > 200
                        ? log.new_value.slice(0, 200) + "…"
                        : log.new_value}
                    </span>
                  </span>
                )}
                {log.change_reason && (
                  <span className="text-gray-500 italic basis-full">
                    Reason: {log.change_reason}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

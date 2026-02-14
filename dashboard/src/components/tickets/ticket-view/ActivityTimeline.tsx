"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export interface TicketActivity {
  id: number;
  ticketId: number;
  actionType: string;
  actorType: string | null;
  actorUserId: number | null;
  actorId: number | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

function formatActivityTime(createdAt: string): string {
  const date = new Date(createdAt);
  return date.toLocaleString();
}

function formatActionLabel(actionType: string): string {
  return actionType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ActivityTimeline({ ticketId }: { ticketId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.tickets.activities(ticketId),
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/activities?limit=50`);
      if (!res.ok) throw new Error("Failed to load activities");
      const json = await res.json();
      return (json.data?.activities ?? []) as TicketActivity[];
    },
    enabled: !!ticketId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load activity timeline.
      </div>
    );
  }

  const activities = data ?? [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-900">Activity timeline</h2>
      </div>
      <div className="max-h-80 overflow-y-auto p-4">
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <div className="shrink-0 w-2 h-2 mt-2 rounded-full bg-gray-400" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-gray-700">
                    {formatActionLabel(a.actionType)}
                  </span>
                  {(a.oldValue != null || a.newValue != null) && (
                    <span className="text-gray-500 ml-1">
                      {a.oldValue != null && typeof a.oldValue === "object" && "status" in a.oldValue && (
                        <>{String((a.oldValue as { status?: string }).status)} → </>
                      )}
                      {a.newValue != null && typeof a.newValue === "object" && "status" in a.newValue && (
                        String((a.newValue as { status?: string }).status)
                      )}
                    </span>
                  )}
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatActivityTime(a.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

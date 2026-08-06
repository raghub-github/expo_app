"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Applies one change set to many tickets through `POST /api/tickets/bulk-update`.
 *
 * The list used to fan out one PATCH per selected ticket with
 * `Promise.allSettled`. Each PATCH ran the workflow engine inline (rules,
 * default-group fallback, a `sql.begin()` queue-balance transaction), so four
 * selected tickets meant four concurrent transactions on the same pool. The
 * list refresh queued behind them and the browser gave up — the "Failed to
 * refresh tickets / request timed out" dialog.
 *
 * One request, processed serially on the server, with automation queued instead
 * of executed. Fields named here are also stamped as manual overrides, so the
 * rules will not revert them.
 */
export type BulkTicketUpdates = {
  status?: string;
  priority?: string;
  groupId?: number | null;
  /** `null` unassigns; omit to leave the assignee alone. */
  currentAssigneeUserId?: number | null;
  isSpam?: boolean;
  tags?: string[];
};

export type BulkUpdateOutcome = {
  batchId: string;
  requested: number;
  updated: number;
  failed: number;
  results: Array<{ ticketId: number; ok: boolean; error?: string; code?: string }>;
};

export function useTicketBulkUpdate() {
  const queryClient = useQueryClient();

  return useCallback(
    async (ticketIds: number[], updates: BulkTicketUpdates): Promise<BulkUpdateOutcome> => {
      const res = await fetch("/api/tickets/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ticketIds, updates }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.data) {
        throw new Error(data?.error ?? "Bulk update failed");
      }

      // Detail panes for the touched tickets are now stale.
      for (const id of ticketIds) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.tickets.detail(String(id)),
          refetchType: "none",
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.activities(String(id)) });
      }

      return data.data as BulkUpdateOutcome;
    },
    [queryClient]
  );
}

/** Toast copy for a bulk result: "4 tickets updated" / "3 updated, 1 failed — <reason>". */
export function describeBulkOutcome(outcome: BulkUpdateOutcome, verb = "updated"): string {
  const plural = (n: number) => `${n} ticket${n === 1 ? "" : "s"}`;
  if (outcome.failed === 0) return `${plural(outcome.updated)} ${verb}`;
  const firstError = outcome.results.find((r) => !r.ok)?.error;
  const tail = firstError ? ` — ${firstError}` : "";
  if (outcome.updated === 0) return `Bulk ${verb} failed for ${plural(outcome.failed)}${tail}`;
  return `${plural(outcome.updated)} ${verb}, ${outcome.failed} failed${tail}`;
}

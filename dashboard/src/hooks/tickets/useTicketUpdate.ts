"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

/** Status transitions that usually drop a row from active / open-queue filters (instant list prune). */
function statusLeavesTypicalActiveList(status: string | undefined): boolean {
  if (status == null) return false;
  const s = String(status).toLowerCase().replace(/-/g, "_");
  return ["resolved", "closed", "rejected", "cancelled", "provisionally_resolved"].includes(s);
}

export function useTicketUpdate() {
  const queryClient = useQueryClient();

  const updateTicket = useMutation({
    mutationFn: async ({
      ticketId,
      status,
      priority,
      currentAssigneeUserId,
      currentAssigneeName,
      groupId,
      groupName,
      slaDueAt,
      tags,
      markFrt,
      buyerNpName,
      sellerNpName,
      logisticsNpName,
      igmActionTriggered,
      igmShortResolution,
      igmLongResolution,
      igmRefundAmount,
      groDetails,
      isSpam,
    }: {
      ticketId: number;
      status?: string;
      /** Persisted spam flag (independent of status). */
      isSpam?: boolean;
      priority?: string;
      currentAssigneeUserId?: number | null;
      currentAssigneeName?: string;
      groupId?: number | null;
      groupName?: string;
      slaDueAt?: string | null;
      tags?: string[];
      markFrt?: boolean;
      buyerNpName?: string | null;
      sellerNpName?: string | null;
      logisticsNpName?: string | null;
      igmActionTriggered?: string | null;
      igmShortResolution?: string | null;
      igmLongResolution?: string | null;
      igmRefundAmount?: string | null;
      groDetails?: string | null;
    }) => {
      const body: Record<string, unknown> = {};
      if (status !== undefined) body.status = status;
      if (isSpam !== undefined) body.isSpam = isSpam;
      if (priority !== undefined) body.priority = priority;
      if (currentAssigneeUserId !== undefined) body.currentAssigneeUserId = currentAssigneeUserId ?? null;
      if (groupId !== undefined) body.groupId = groupId ?? null;
      if (slaDueAt !== undefined) body.slaDueAt = slaDueAt ?? null;
      if (tags !== undefined) body.tags = tags;
      if (markFrt === true) body.markFrt = true;
      if (buyerNpName !== undefined) body.buyerNpName = buyerNpName;
      if (sellerNpName !== undefined) body.sellerNpName = sellerNpName;
      if (logisticsNpName !== undefined) body.logisticsNpName = logisticsNpName;
      if (igmActionTriggered !== undefined) body.igmActionTriggered = igmActionTriggered;
      if (igmShortResolution !== undefined) body.igmShortResolution = igmShortResolution;
      if (igmLongResolution !== undefined) body.igmLongResolution = igmLongResolution;
      if (igmRefundAmount !== undefined) body.igmRefundAmount = igmRefundAmount;
      if (groDetails !== undefined) body.groDetails = groDetails;
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Update failed");
      return data.data;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        predicate: (q) => {
          const k = q.queryKey;
          if (k[0] !== "tickets") return false;
          if (k[1] === "list") return true;
          if (k[1] === "detail" && variables.ticketId != null && String(k[2]) === String(variables.ticketId)) {
            return true;
          }
          return false;
        },
      });

      const patchTicket = (t: any) => {
        if (!t || t.id !== variables.ticketId) return t;
        const next = { ...t };
        if (variables.status !== undefined) next.status = variables.status;
        if (variables.isSpam !== undefined) next.isSpam = variables.isSpam;
        if (variables.priority !== undefined) next.priority = variables.priority;
        if (variables.groupId !== undefined) {
          if (variables.groupId == null) next.group = null;
          else {
            const current = next.group ?? {};
            next.group = {
              ...current,
              id: variables.groupId,
              name: variables.groupName ?? current.name ?? "",
              code: current.code ?? "",
            };
          }
        }
        if (variables.currentAssigneeUserId !== undefined) {
          if (variables.currentAssigneeUserId == null) next.assignee = null;
          else {
            const current = next.assignee ?? {};
            next.assignee = {
              ...current,
              id: variables.currentAssigneeUserId,
              name: variables.currentAssigneeName ?? current.name ?? "",
              email: current.email ?? "",
            };
          }
        }
        if (variables.slaDueAt !== undefined) next.slaDueAt = variables.slaDueAt;
        if (variables.tags !== undefined) next.tags = variables.tags;
        if (variables.markFrt === true) {
          const now = new Date().toISOString();
          next.firstResponseAt = next.firstResponseAt ?? now;
          next.firstResponseTimeMinutes = next.firstResponseTimeMinutes ?? Math.max(
            0,
            Math.floor((new Date(now).getTime() - new Date(next.createdAt).getTime()) / 60000)
          );
          next.metadata = { ...(next.metadata ?? {}), frt_marked: true };
        }
        if (variables.buyerNpName !== undefined) next.buyerNpName = variables.buyerNpName;
        if (variables.sellerNpName !== undefined) next.sellerNpName = variables.sellerNpName;
        if (variables.logisticsNpName !== undefined) next.logisticsNpName = variables.logisticsNpName;
        if (variables.igmActionTriggered !== undefined) next.igmActionTriggered = variables.igmActionTriggered;
        if (variables.igmShortResolution !== undefined) next.igmShortResolution = variables.igmShortResolution;
        if (variables.igmLongResolution !== undefined) next.igmLongResolution = variables.igmLongResolution;
        if (variables.igmRefundAmount !== undefined) next.igmRefundAmount = variables.igmRefundAmount;
        if (variables.groDetails !== undefined) next.groDetails = variables.groDetails;
        return next;
      };

      const pruneResolvedRow = statusLeavesTypicalActiveList(variables.status);

      queryClient.setQueriesData({ queryKey: queryKeys.tickets.all() }, (old: any) => {
        if (!old || !Array.isArray(old.tickets)) return old;
        if (pruneResolvedRow && variables.ticketId != null) {
          const had = old.tickets.some((t: any) => t.id === variables.ticketId);
          if (!had) return old;
          return {
            ...old,
            tickets: old.tickets.filter((t: any) => t.id !== variables.ticketId),
            total: Math.max(0, Number(old.total ?? 0) - 1),
          };
        }
        return { ...old, tickets: old.tickets.map((t: any) => patchTicket(t)) };
      });

      if (variables.ticketId) {
        queryClient.setQueryData(queryKeys.tickets.detail(variables.ticketId), (old: any) =>
          old ? patchTicket(old) : old
        );
      }
    },
    onSuccess: (_, variables) => {
      // Must refetch *active* list queries — the queue/table is usually mounted; "inactive" left stale rows after resolve.
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "tickets" && q.queryKey[1] === "list",
        refetchType: "active",
      });
      if (variables.ticketId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(variables.ticketId), refetchType: "active" });
        // Status / assignee / etc. write activity rows server-side; timeline must refetch or it stays stale until staleTime.
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.activities(variables.ticketId) });
      }
    },
  });

  return updateTicket;
}

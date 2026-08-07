"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { TicketDetail } from "@/hooks/tickets/useTicketDetail";
import type { Ticket } from "@/hooks/tickets/useTickets";
import {
  mergePostgresRowIntoListTicket,
  mergePostgresRowIntoTicketDetail,
  patchTicketInListCaches,
  statusLeavesTypicalActiveList,
  invalidateTicketListCaches,
} from "@/lib/tickets/patch-ticket-list-cache";

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

      const patchListRow = (t: Ticket): Ticket => {
        if (t.id !== variables.ticketId) return t;
        const next = { ...t };
        if (variables.status !== undefined) next.status = variables.status;
        if (variables.isSpam !== undefined) next.isSpam = variables.isSpam;
        if (variables.priority !== undefined) next.priority = variables.priority;
        if (variables.groupId !== undefined) {
          next.group =
            variables.groupId == null
              ? null
              : {
                  id: variables.groupId,
                  name: variables.groupName ?? t.group?.name ?? "",
                  code: t.group?.code ?? "",
                };
        }
        if (variables.currentAssigneeUserId !== undefined) {
          next.assignee =
            variables.currentAssigneeUserId == null
              ? null
              : {
                  id: variables.currentAssigneeUserId,
                  name: variables.currentAssigneeName ?? t.assignee?.name ?? "",
                  email: t.assignee?.email ?? "",
                };
        }
        if (variables.slaDueAt !== undefined) next.slaDueAt = variables.slaDueAt;
        return next;
      };

      const patchDetailRow = (t: TicketDetail): TicketDetail => {
        if (t.id !== variables.ticketId) return t;
        const next = { ...t };
        if (variables.status !== undefined) next.status = variables.status;
        if (variables.isSpam !== undefined) next.isSpam = variables.isSpam;
        if (variables.priority !== undefined) next.priority = variables.priority;
        if (variables.groupId !== undefined) {
          next.group =
            variables.groupId == null
              ? null
              : {
                  id: variables.groupId,
                  groupName: variables.groupName ?? t.group?.groupName ?? "",
                  groupCode: t.group?.groupCode ?? "",
                };
        }
        if (variables.currentAssigneeUserId !== undefined) {
          next.assignee =
            variables.currentAssigneeUserId == null
              ? null
              : {
                  id: variables.currentAssigneeUserId,
                  name: variables.currentAssigneeName ?? t.assignee?.name ?? "",
                  email: t.assignee?.email ?? "",
                };
        }
        if (variables.slaDueAt !== undefined) next.slaDueAt = variables.slaDueAt;
        if (variables.tags !== undefined) next.tags = variables.tags;
        if (variables.markFrt === true) {
          const now = new Date().toISOString();
          next.firstResponseAt = next.firstResponseAt ?? now;
          next.firstResponseTimeMinutes =
            next.firstResponseTimeMinutes ??
            Math.max(0, Math.floor((new Date(now).getTime() - new Date(next.createdAt).getTime()) / 60000));
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

      patchTicketInListCaches(queryClient, variables.ticketId, patchListRow, {
        pruneIfStatus: pruneResolvedRow ? variables.status : undefined,
      });

      if (variables.ticketId) {
        queryClient.setQueryData(queryKeys.tickets.detail(String(variables.ticketId)), (old: TicketDetail | undefined) =>
          old ? patchDetailRow(old) : old
        );
      }
    },
    onSuccess: (raw, variables) => {
      const tid = variables.ticketId;
      if (tid != null) {
        const payload = raw as { ticket?: Record<string, unknown> } | null | undefined;
        const row = payload?.ticket;
        const key = queryKeys.tickets.detail(String(tid));
        if (row && typeof row === "object") {
          queryClient.setQueryData<TicketDetail>(key, (old) =>
            old ? mergePostgresRowIntoTicketDetail(old, row) : old
          );
          queryClient.invalidateQueries({ queryKey: key, refetchType: "none" });
          patchTicketInListCaches(queryClient, tid, (t) => mergePostgresRowIntoListTicket(t, row));
        } else {
          queryClient.invalidateQueries({ queryKey: key, refetchType: "active" });
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.activities(String(tid)) });
      }
      invalidateTicketListCaches(queryClient);
    },
  });

  return updateTicket;
}

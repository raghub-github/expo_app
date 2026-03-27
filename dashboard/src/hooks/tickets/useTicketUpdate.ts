"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

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
    }: {
      ticketId: number;
      status?: string;
      priority?: string;
      currentAssigneeUserId?: number | null;
      currentAssigneeName?: string;
      groupId?: number | null;
      groupName?: string;
      slaDueAt?: string | null;
      tags?: string[];
    }) => {
      const body: Record<string, unknown> = {};
      if (status !== undefined) body.status = status;
      if (priority !== undefined) body.priority = priority;
      if (currentAssigneeUserId !== undefined) body.currentAssigneeUserId = currentAssigneeUserId ?? null;
      if (groupId !== undefined) body.groupId = groupId ?? null;
      if (slaDueAt !== undefined) body.slaDueAt = slaDueAt ?? null;
      if (tags !== undefined) body.tags = tags;
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Update failed");
      return data.data;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tickets.all() });
      if (variables.ticketId) {
        await queryClient.cancelQueries({ queryKey: queryKeys.tickets.detail(variables.ticketId) });
      }

      const patchTicket = (t: any) => {
        if (!t || t.id !== variables.ticketId) return t;
        const next = { ...t };
        if (variables.status !== undefined) next.status = variables.status;
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
        return next;
      };

      queryClient.setQueriesData({ queryKey: queryKeys.tickets.all() }, (old: any) => {
        if (!old || !Array.isArray(old.tickets)) return old;
        return { ...old, tickets: old.tickets.map((t: any) => patchTicket(t)) };
      });

      if (variables.ticketId) {
        queryClient.setQueryData(queryKeys.tickets.detail(variables.ticketId), (old: any) =>
          old ? patchTicket(old) : old
        );
      }
    },
    onSuccess: (_, variables) => {
      // Keep server state synced without forcing visible hard reload/flicker.
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all(), refetchType: "inactive" });
      if (variables.ticketId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(variables.ticketId), refetchType: "inactive" });
      }
    },
  });

  return updateTicket;
}

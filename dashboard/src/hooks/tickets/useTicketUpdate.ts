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
      groupId,
      slaDueAt,
      tags,
    }: {
      ticketId: number;
      status?: string;
      priority?: string;
      currentAssigneeUserId?: number | null;
      groupId?: number | null;
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all() });
      if (variables.ticketId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(variables.ticketId) });
      }
    },
  });

  return updateTicket;
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type TicketComposeAutomationDto = {
  defaultTo: string;
  defaultCc: string;
  defaultBcc: string;
  updatedAt?: string | null;
};

const QUERY_KEY = ["ticketComposeAutomation"] as const;

export function useTicketComposeAutomationQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<TicketComposeAutomationDto> => {
      const res = await fetch("/api/tickets/compose-automation", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const d = json?.data;
      return {
        defaultTo: typeof d?.defaultTo === "string" ? d.defaultTo : "",
        defaultCc: typeof d?.defaultCc === "string" ? d.defaultCc : "",
        defaultBcc: typeof d?.defaultBcc === "string" ? d.defaultBcc : "",
        updatedAt: d?.updatedAt ?? null,
      };
    },
    staleTime: 60_000,
  });
}

export function useTicketComposeAutomationSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { defaultTo: string; defaultCc: string; defaultBcc: string }) => {
      const res = await fetch("/api/tickets/compose-automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Save failed");
      const d = json?.data;
      return {
        defaultTo: String(d?.defaultTo ?? ""),
        defaultCc: String(d?.defaultCc ?? ""),
        defaultBcc: String(d?.defaultBcc ?? ""),
        updatedAt: d?.updatedAt ?? null,
      } satisfies TicketComposeAutomationDto;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    },
  });
}

export function invalidateTicketComposeAutomation(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}

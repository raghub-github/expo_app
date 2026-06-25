"use client";


import { useAppSearchParams } from "@/lib/navigation/use-app-search-params";
import { normalizeQueueSupervisorSection } from "@/lib/tickets/queue-supervisor-sections";
import { QueueSupervisorUpdatedAgentsClient } from "@/components/tickets/queue/QueueSupervisorUpdatedAgentsClient";
import { QueueSupervisorAgentTicketsClient } from "@/components/tickets/queue/QueueSupervisorAgentTicketsClient";
import { QueueSupervisorAgentStatusHistoryClient } from "@/components/tickets/queue/QueueSupervisorAgentStatusHistoryClient";

export function QueueSupervisorClient() {
  const searchParams = useAppSearchParams();
  const section = normalizeQueueSupervisorSection(searchParams.get("section"));
  if (section === "agent-tickets") {
    return <QueueSupervisorAgentTicketsClient />;
  }
  if (section === "status-history") {
    return <QueueSupervisorAgentStatusHistoryClient />;
  }
  return <QueueSupervisorUpdatedAgentsClient />;
}

"use client";

import { useSearchParams } from "next/navigation";
import { normalizeQueueSupervisorSection } from "@/lib/tickets/queue-supervisor-sections";
import { QueueSupervisorUpdatedAgentsClient } from "@/components/tickets/queue/QueueSupervisorUpdatedAgentsClient";
import { QueueSupervisorAgentTicketsClient } from "@/components/tickets/queue/QueueSupervisorAgentTicketsClient";
import { QueueSupervisorAgentStatusHistoryClient } from "@/components/tickets/queue/QueueSupervisorAgentStatusHistoryClient";

export function QueueSupervisorClient() {
  const searchParams = useSearchParams();
  const section = normalizeQueueSupervisorSection(searchParams.get("section"));
  if (section === "agent-tickets") {
    return <QueueSupervisorAgentTicketsClient />;
  }
  if (section === "status-history") {
    return <QueueSupervisorAgentStatusHistoryClient />;
  }
  return <QueueSupervisorUpdatedAgentsClient />;
}

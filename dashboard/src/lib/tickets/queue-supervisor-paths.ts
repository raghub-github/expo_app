import { TICKETS_QUEUE_SUPERVISOR_PATH } from "@/lib/tickets/ticket-path-utils";
import type { QueueSupervisorSection } from "@/lib/tickets/queue-supervisor-sections";

export function queueSupervisorHref(section: QueueSupervisorSection, agentId?: string | null): string {
  const params = new URLSearchParams();
  params.set("section", section);
  const aid = typeof agentId === "string" ? agentId.trim() : "";
  if (aid) params.set("agentId", aid);
  return `${TICKETS_QUEUE_SUPERVISOR_PATH}?${params.toString()}`;
}

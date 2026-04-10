export type QueueSupervisorSection = "updated-agents" | "agent-tickets" | "status-history";

const ALLOWED = new Set<QueueSupervisorSection>(["updated-agents", "agent-tickets", "status-history"]);

export function normalizeQueueSupervisorSection(raw: string | null | undefined): QueueSupervisorSection {
  if (raw != null && raw !== "" && ALLOWED.has(raw as QueueSupervisorSection)) return raw as QueueSupervisorSection;
  return "updated-agents";
}

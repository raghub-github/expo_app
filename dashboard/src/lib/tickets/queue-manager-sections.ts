export type QueueManagerSection =
  | "max-open"
  | "compose"
  | "email-assigned"
  | "email-reopened";

const ALLOWED = new Set<QueueManagerSection>(["max-open", "compose", "email-assigned", "email-reopened"]);

export function normalizeQueueManagerSection(raw: string | null): QueueManagerSection {
  if (raw && ALLOWED.has(raw as QueueManagerSection)) return raw as QueueManagerSection;
  return "max-open";
}

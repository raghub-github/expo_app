export type QueueManagerSection =
  | "max-open"
  | "agent-capacity"
  | "assignment-sound"
  | "email-assigned"
  | "email-reopened"
  | "workflow-rules";

const ALLOWED = new Set<QueueManagerSection>([
  "max-open",
  "agent-capacity",
  "assignment-sound",
  "email-assigned",
  "email-reopened",
  "workflow-rules",
]);

/** Legacy `?section=compose` (default reply recipients) merged into max-open. */
export function normalizeQueueManagerSection(raw: string | null): QueueManagerSection {
  if (raw === "compose") return "max-open";
  if (raw && ALLOWED.has(raw as QueueManagerSection)) return raw as QueueManagerSection;
  return "max-open";
}

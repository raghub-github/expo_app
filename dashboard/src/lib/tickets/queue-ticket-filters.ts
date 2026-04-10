/**
 * Agent queue home (`/dashboard/tickets/queue/home`): assignee + active lifecycle only.
 * Keep in sync with GET /api/tickets when `queueScope=1`.
 */
export const QUEUE_HOME_ACTIVE_STATUS_DB = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING",
  "REOPENED",
  "WAITING_FOR_USER",
  "WAITING_FOR_MERCHANT",
  "WAITING_FOR_RIDER",
  "ESCALATED",
] as const;

/** Lowercase/hyphen tokens for URL `status=` (API normalizes to DB enums). */
export const QUEUE_HOME_ACTIVE_STATUSES_URL = QUEUE_HOME_ACTIVE_STATUS_DB.map((s) =>
  s.toLowerCase().replace(/_/g, "-")
);

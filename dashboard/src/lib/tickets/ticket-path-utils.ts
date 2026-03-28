/**
 * Single-segment routes under /dashboard/tickets/* that are not ticket detail IDs.
 * Keeps layout/sidebar from treating e.g. agent-activity as ticketId.
 */
const RESERVED_TICKETS_FIRST_SEGMENT = new Set([
  "agent-activity",
  "dashboard",
  "unified",
  "new",
  "food",
  "csat",
  "customer",
]);

/** Returns ticket id/number segment or null when path is a reserved list route or not /tickets/:oneSegment */
export function ticketsPathTicketId(cleanPathname: string): string | null {
  const m = cleanPathname.match(/^\/dashboard\/tickets\/([^/]+)$/);
  if (!m) return null;
  const seg = decodeURIComponent(m[1]);
  if (RESERVED_TICKETS_FIRST_SEGMENT.has(seg.toLowerCase())) return null;
  return seg;
}

/** True when URL is an individual ticket view (properties rail, filter chrome, etc.) */
export function isTicketsAppDetailPath(cleanPathname: string): boolean {
  return ticketsPathTicketId(cleanPathname) != null;
}

export const AGENT_ACTIVITY_PATH = "/dashboard/tickets/agent-activity";

/** Helpdesk-style metrics dashboard (Freshdesk-like widgets). */
export const TICKETS_HELPDESK_DASHBOARD_PATH = "/dashboard/tickets/dashboard";

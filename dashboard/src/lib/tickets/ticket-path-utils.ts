import { normalizeQueueManagerSection, type QueueManagerSection } from "@/lib/tickets/queue-manager-sections";
import { normalizeQueueSupervisorSection } from "@/lib/tickets/queue-supervisor-sections";

/**
 * Single-segment routes under /dashboard/tickets/* that are not ticket detail IDs.
 * Keeps layout/sidebar from treating e.g. agent-activity as ticketId.
 */
const RESERVED_TICKETS_FIRST_SEGMENT = new Set([
  "agent-activity",
  "dashboard",
  "dashboard_snapshot",
  "unified",
  "new",
  "food",
  "csat",
  "customer",
  "queue",
]);

/** Punch-in / queue workspace (linked from the tickets hub header via client-side navigation). */
export const TICKETS_QUEUE_HOME_PATH = "/dashboard/tickets/queue/home";
export const TICKETS_QUEUE_SUPERVISOR_PATH = "/dashboard/tickets/queue/supervisor";
export const TICKETS_QUEUE_MANAGER_PATH = "/dashboard/tickets/queue/manager";

const QUEUE_MANAGER_HEADER_TITLES: Record<QueueManagerSection, string> = {
  "max-open": "Queue settings",
  "agent-capacity": "Agent capacity",
  "assignment-sound": "Queue alert sound",
  "email-assigned": "Email: assigned",
  "email-reopened": "Email: reopened",
  "workflow-rules": "Workflow rules",
  "response-templates": "Response library",
};

/** Title for the main app header on `/dashboard/tickets/queue/*` (uses `section` when relevant). */
export function resolveTicketsQueueHeaderTitle(pathnameClean: string, sectionQuery: string | null): string {
  const clean = pathnameClean.split("?")[0].split("#")[0];
  if (clean === "/dashboard/tickets/queue" || clean === "/dashboard/tickets/queue/home") {
    return "Queue";
  }
  if (clean.startsWith("/dashboard/tickets/queue/supervisor")) {
    const sup = normalizeQueueSupervisorSection(sectionQuery);
    if (sup === "agent-tickets") return "Agent tickets";
    if (sup === "status-history") return "Status history";
    return "Updated agents";
  }
  if (clean.startsWith("/dashboard/tickets/queue/manager")) {
    return QUEUE_MANAGER_HEADER_TITLES[normalizeQueueManagerSection(sectionQuery)];
  }
  return "Queue";
}

/** Agent queue workspace: dedicated layout (no global icon rail; tickets sub-nav docks left). */
export function isTicketsQueueWorkspacePath(cleanPathname: string): boolean {
  return cleanPathname.startsWith("/dashboard/tickets/queue");
}

/** Query flag on ticket detail URLs opened from the agent queue list (`/dashboard/tickets/queue/home`). */
export const TICKET_FROM_QUEUE_PARAM = "fromQueue";

export function ticketDetailHasQueueContext(
  search: string | URLSearchParams | null | undefined
): boolean {
  if (search == null || search === "") return false;
  const p =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : new URLSearchParams(search.toString());
  return p.get(TICKET_FROM_QUEUE_PARAM) === "1";
}

/**
 * Same chrome as `/dashboard/tickets/queue/*`: hide global sidebar, dock tickets rail left.
 * True for queue routes or ticket detail with `?fromQueue=1`.
 */
export function isTicketsQueueLayoutExperience(
  cleanPathname: string,
  search?: string | URLSearchParams | null
): boolean {
  if (isTicketsQueueWorkspacePath(cleanPathname)) return true;
  if (isTicketsAppDetailPath(cleanPathname) && ticketDetailHasQueueContext(search ?? null)) return true;
  return false;
}

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

/** GatiMitra Queue metrics dashboard (Freshdesk-like widgets). */
export const TICKETS_HELPDESK_DASHBOARD_PATH = "/dashboard/tickets/dashboard_snapshot";

/** Ticket detail URL carrying list filters/sort; strips `panel` so detail sub-views still use a clean default. */
export function buildTicketDetailHref(ticketId: number | string, listSearchParams: URLSearchParams | string): string {
  const base = `/dashboard/tickets/${String(ticketId).trim()}`;
  const p =
    typeof listSearchParams === "string"
      ? new URLSearchParams(listSearchParams.startsWith("?") ? listSearchParams.slice(1) : listSearchParams)
      : new URLSearchParams(listSearchParams.toString());
  p.delete("panel");
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}

/** From a ticket detail query string, link back to the main list with the same filters (drops `panel`). */
export function buildTicketsListHrefPreservingFilters(search: string): string {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  p.delete("panel");
  const fromQueue = p.get(TICKET_FROM_QUEUE_PARAM) === "1";
  p.delete(TICKET_FROM_QUEUE_PARAM);
  const q = p.toString();
  if (fromQueue) {
    return q ? `${TICKETS_QUEUE_HOME_PATH}?${q}` : TICKETS_QUEUE_HOME_PATH;
  }
  return q ? `/dashboard/tickets?${q}` : "/dashboard/tickets";
}

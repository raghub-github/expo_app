/**
 * Assign/reopen notification emails (non-blocking from PATCH).
 * Sends only when the matching `ticket_notification_automation` row has `enabled = true`.
 */

import type { TicketAuditSqlClient } from "@/lib/db/operations/ticket-activity-audit";
import { getSystemUserById } from "@/lib/db/operations/users";
import { sendEmail } from "@/lib/email/send";

export type TicketNotificationEventCode = "ticket_assigned" | "ticket_reopened";

export type TicketNotificationAutomationRow = {
  event_code: string;
  enabled: boolean;
  email_to: string;
  email_cc: string;
  email_bcc: string;
  subject_template: string;
  body_template: string;
};

/**
 * Absolute dashboard origin for `{{ticket_url}}` in notification emails.
 * Order: DASHBOARD_APP_URL (server) → NEXT_PUBLIC_APP_URL → VERCEL_URL → production default.
 * Set NEXT_PUBLIC_APP_URL or DASHBOARD_APP_URL to https://control.gatimitra.com (or your host) in production.
 */
function dashboardBaseUrl(): string {
  const explicit =
    process.env.DASHBOARD_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const v = process.env.VERCEL_URL?.trim();
  if (v) return `https://${v.replace(/^https?:\/\//, "")}`.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    return "https://control.gatimitra.com";
  }

  return "";
}

export function renderTicketNotificationTemplate(template: string, vars: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

function splitEmails(rendered: string): string[] {
  return rendered
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function loadAutomationRow(
  sql: TicketAuditSqlClient,
  eventCode: TicketNotificationEventCode
): Promise<TicketNotificationAutomationRow | null> {
  try {
    const rows = (await sql.unsafe(
      `SELECT event_code, enabled, email_to, email_cc, email_bcc, subject_template, body_template
       FROM public.ticket_notification_automation WHERE event_code = $1 LIMIT 1`,
      [eventCode]
    )) as TicketNotificationAutomationRow[];
    return rows?.[0] ?? null;
  } catch (e) {
    console.warn("[ticket-notification] automation table missing or error:", e);
    return null;
  }
}

async function loadTicketContext(
  sql: { unsafe: (q: string, p?: unknown[]) => Promise<unknown[]> },
  ticketId: number
): Promise<{
  id: number;
  ticket_id: string | null;
  subject: string;
  raised_by_name: string | null;
  raised_by_mobile: string | null;
  raised_by_email: string | null;
  status: string | null;
  assigned_to_agent_id: number | null;
} | null> {
  try {
    const rows = (await sql.unsafe(
      `SELECT id, ticket_id, subject, raised_by_name, raised_by_mobile, raised_by_email, status, assigned_to_agent_id
       FROM public.unified_tickets WHERE id = $1 LIMIT 1`,
      [ticketId]
    )) as Record<string, unknown>[];
    const r = rows?.[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      ticket_id: r.ticket_id != null ? String(r.ticket_id) : null,
      subject: typeof r.subject === "string" ? r.subject : String(r.subject ?? ""),
      raised_by_name: r.raised_by_name != null ? String(r.raised_by_name) : null,
      raised_by_mobile: r.raised_by_mobile != null ? String(r.raised_by_mobile) : null,
      raised_by_email: r.raised_by_email != null ? String(r.raised_by_email) : null,
      status: r.status != null ? String(r.status) : null,
      assigned_to_agent_id: r.assigned_to_agent_id != null ? Number(r.assigned_to_agent_id) : null,
    };
  } catch (e) {
    console.error("[ticket-notification] load ticket failed:", e);
    return null;
  }
}

function buildVars(params: {
  agentName: string;
  agentEmail: string;
  ticket: NonNullable<Awaited<ReturnType<typeof loadTicketContext>>>;
}): Record<string, string> {
  const base = dashboardBaseUrl();
  const ticketPath = `/dashboard/tickets/${params.ticket.id}`;
  const ticketUrl = base ? `${base}${ticketPath}` : ticketPath;
  const ticketRef = params.ticket.ticket_id?.trim() || String(params.ticket.id);
  return {
    agent_name: params.agentName,
    agent_email: params.agentEmail,
    ticket_ref: ticketRef,
    subject: params.ticket.subject || "(no subject)",
    ticket_url: ticketUrl,
    raised_by_name: params.ticket.raised_by_name ?? "",
    raised_by_mobile: params.ticket.raised_by_mobile ?? "",
    raised_by_email: params.ticket.raised_by_email ?? "",
    status: params.ticket.status ?? "",
  };
}

async function sendFromRow(
  row: TicketNotificationAutomationRow,
  vars: Record<string, string>
): Promise<void> {
  const toRendered = renderTicketNotificationTemplate(row.email_to || "{{agent_email}}", vars);
  let toList = splitEmails(toRendered);
  if (toList.length === 0 && vars.agent_email) {
    toList = [vars.agent_email];
  }
  if (toList.length === 0) {
    console.warn("[ticket-notification] skip send: no To addresses after template render");
    return;
  }

  const ccList = splitEmails(renderTicketNotificationTemplate(row.email_cc ?? "", vars));
  const bccList = splitEmails(renderTicketNotificationTemplate(row.email_bcc ?? "", vars));
  const subject = renderTicketNotificationTemplate(row.subject_template, vars).slice(0, 500);
  const body = renderTicketNotificationTemplate(row.body_template, vars);
  const hasHtml = /<[a-z][\s\S]*>/i.test(body);

  const outcome = await sendEmail({
    to: toList.length === 1 ? toList[0] : toList,
    ...(ccList.length ? { cc: ccList.length === 1 ? ccList[0] : ccList } : {}),
    ...(bccList.length ? { bcc: bccList.length === 1 ? bccList[0] : bccList } : {}),
    subject: subject || "Ticket notification",
    text: hasHtml ? body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || body : body,
    ...(hasHtml ? { html: body } : {}),
  });
  if (!outcome.ok) {
    console.error("[ticket-notification] sendEmail failed:", outcome);
  }
}

/**
 * Fire-and-forget from PATCH: notify newly assigned agent.
 */
export async function queueTicketAssignedNotification(
  sql: TicketAuditSqlClient,
  ticketId: number,
  assigneeUserId: number
): Promise<void> {
  const row = await loadAutomationRow(sql, "ticket_assigned");
  if (!row?.enabled) return;

  const assignee = await getSystemUserById(assigneeUserId);
  const agentEmail = assignee?.email?.trim() ?? "";
  if (!agentEmail) {
    console.warn("[ticket-notification] assign: no assignee email for user id", assigneeUserId);
    return;
  }
  const agentName = assignee?.fullName?.trim() || agentEmail;

  const ticket = await loadTicketContext(sql, ticketId);
  if (!ticket) return;

  const vars = buildVars({
    agentName,
    agentEmail,
    ticket,
  });
  await sendFromRow(row, vars);
}

/**
 * Fire-and-forget from PATCH: notify current assignee when status becomes REOPENED.
 */
export async function queueTicketReopenedNotification(
  sql: TicketAuditSqlClient,
  ticketId: number
): Promise<void> {
  const row = await loadAutomationRow(sql, "ticket_reopened");
  if (!row?.enabled) return;

  const ticket = await loadTicketContext(sql, ticketId);
  if (!ticket?.assigned_to_agent_id) {
    console.warn("[ticket-notification] reopen: no assignee on ticket", ticketId);
    return;
  }

  const assignee = await getSystemUserById(ticket.assigned_to_agent_id);
  const agentEmail = assignee?.email?.trim() ?? "";
  if (!agentEmail) return;
  const agentName = assignee?.fullName?.trim() || agentEmail;

  const vars = buildVars({
    agentName,
    agentEmail,
    ticket,
  });
  await sendFromRow(row, vars);
}

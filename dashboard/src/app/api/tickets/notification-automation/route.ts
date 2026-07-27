/**
 * GET/PATCH /api/tickets/notification-automation
 * Server templates for emails on ticket_assigned and ticket_reopened.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import type { TicketAuditSqlClient } from "@/lib/db/operations/ticket-activity-audit";

export const runtime = "nodejs";

const EVENT_CODES = new Set(["ticket_assigned", "ticket_reopened"]);

async function requireTicketEditor() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    if (isInvalidRefreshToken(userError)) {
      await signOutIfSessionDead(supabase, userError);
      return {
        error: NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 }),
      };
    }
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  if (!user) {
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  const systemUser = await getSystemUserByEmail(user.email!);
  if (!systemUser) {
    return { error: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }) };
  }
  const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
  const hasTicketAccess = await hasDashboardAccessByAuth(user.id, user.email!, "TICKET");
  if (!userIsSuperAdmin && !hasTicketAccess) {
    return { error: NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 }) };
  }
  return { systemUser };
}

export async function GET() {
  const auth = await requireTicketEditor();
  if ("error" in auth && auth.error) return auth.error;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT event_code, enabled, email_to, email_cc, email_bcc, subject_template, body_template, updated_at
      FROM public.ticket_notification_automation
      ORDER BY event_code ASC
    `;
    return NextResponse.json({ success: true, data: { templates: rows ?? [] } });
  } catch (e) {
    console.error("[GET /api/tickets/notification-automation]", e);
    return NextResponse.json(
      { success: false, error: "Automation table missing — run migration 0155_ticket_notification_automation.sql" },
      { status: 503 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireTicketEditor();
  if ("error" in auth && auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const templates = (body as { templates?: unknown }).templates;
  if (!Array.isArray(templates) || templates.length === 0) {
    return NextResponse.json({ success: false, error: "templates[] required" }, { status: 400 });
  }

  const db = getSql();
  const auditSql = db as TicketAuditSqlClient;

  try {
    for (const raw of templates) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as Record<string, unknown>;
      const eventCode = typeof t.event_code === "string" ? t.event_code.trim() : "";
      if (!EVENT_CODES.has(eventCode)) continue;

      const enabled = Boolean(t.enabled);
      const email_to = typeof t.email_to === "string" ? t.email_to.slice(0, 4000) : "";
      const email_cc = typeof t.email_cc === "string" ? t.email_cc.slice(0, 4000) : "";
      const email_bcc = typeof t.email_bcc === "string" ? t.email_bcc.slice(0, 4000) : "";
      const subject_template = typeof t.subject_template === "string" ? t.subject_template.slice(0, 500) : "";
      const body_template = typeof t.body_template === "string" ? t.body_template.slice(0, 50000) : "";

      await auditSql.unsafe(
        `UPDATE public.ticket_notification_automation
         SET enabled = $1, email_to = $2, email_cc = $3, email_bcc = $4, subject_template = $5, body_template = $6, updated_at = NOW()
         WHERE event_code = $7`,
        [enabled, email_to, email_cc, email_bcc, subject_template, body_template, eventCode]
      );
    }

    const rows = await db`
      SELECT event_code, enabled, email_to, email_cc, email_bcc, subject_template, body_template, updated_at
      FROM public.ticket_notification_automation
      ORDER BY event_code ASC
    `;
    return NextResponse.json({ success: true, data: { templates: rows ?? [] } });
  } catch (e) {
    console.error("[PATCH /api/tickets/notification-automation]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}

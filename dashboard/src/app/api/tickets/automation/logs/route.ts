/**
 * GET /api/tickets/automation/logs — recent automation audit / execution logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

async function requireTicketManager() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    if (isInvalidRefreshToken(userError)) {
      await supabase.auth.signOut();
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

export async function GET(request: NextRequest) {
  const auth = await requireTicketManager();
  if ("error" in auth && auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const ticketIdRaw = searchParams.get("ticketId");
  const ruleIdRaw = searchParams.get("ruleId");
  const logTypeRaw = searchParams.get("logType");
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));

  try {
    const sql = getSql();
    if (ticketIdRaw) {
      const ticketId = parseInt(ticketIdRaw, 10);
      if (!Number.isFinite(ticketId)) {
        return NextResponse.json({ success: false, error: "Invalid ticketId" }, { status: 400 });
      }
      const logs = (await sql`
        SELECT id, created_at, log_type, rule_id, ticket_id, actor_user_id, summary, details
        FROM public.ticket_automation_logs
        WHERE ticket_id = ${ticketId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `) as Record<string, unknown>[];
      return NextResponse.json({ success: true, data: { logs } });
    }
    if (ruleIdRaw) {
      const ruleId = parseInt(ruleIdRaw, 10);
      if (!Number.isFinite(ruleId)) {
        return NextResponse.json({ success: false, error: "Invalid ruleId" }, { status: 400 });
      }
      const logs = (await sql`
        SELECT id, created_at, log_type, rule_id, ticket_id, actor_user_id, summary, details
        FROM public.ticket_automation_logs
        WHERE rule_id = ${ruleId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `) as Record<string, unknown>[];
      return NextResponse.json({ success: true, data: { logs } });
    }

    if (logTypeRaw) {
      const lt = logTypeRaw.trim();
      const logs = (await sql`
        SELECT id, created_at, log_type, rule_id, ticket_id, actor_user_id, summary, details
        FROM public.ticket_automation_logs
        WHERE log_type = ${lt}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `) as Record<string, unknown>[];
      return NextResponse.json({ success: true, data: { logs } });
    }

    const logs = (await sql`
      SELECT id, created_at, log_type, rule_id, ticket_id, actor_user_id, summary, details
      FROM public.ticket_automation_logs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as Record<string, unknown>[];

    return NextResponse.json({ success: true, data: { logs } });
  } catch (e) {
    console.error("[GET /api/tickets/automation/logs]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

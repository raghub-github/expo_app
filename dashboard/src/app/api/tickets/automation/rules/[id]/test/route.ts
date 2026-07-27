/**
 * POST /api/tickets/automation/rules/[id]/test — dry-run (evaluate + simulate actions, no writes).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import { evaluateConditions } from "@/lib/tickets/ticket-automation/condition-eval";
import { loadActions, loadConditions, loadAgentSnapshot, loadTicketSnapshot } from "@/lib/tickets/ticket-automation/engine";
import type { AutomationContext, AutomationTriggerEvent } from "@/lib/tickets/ticket-automation/types";

export const runtime = "nodejs";

async function requireTicketManager() {
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTicketManager();
  if ("error" in auth && auth.error) return auth.error;

  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (!Number.isFinite(ruleId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  let body: { ticketId?: number; agentUserId?: number };
  try {
    body = (await request.json()) as { ticketId?: number; agentUserId?: number };
  } catch {
    body = {};
  }

  try {
    const sql = getSql();
    const rules = (await sql`
      SELECT id, trigger_event::text AS trigger_event, rule_code, rule_name
      FROM public.ticket_automation_rules WHERE id = ${ruleId} LIMIT 1
    `) as { id?: unknown; trigger_event?: string; rule_code?: string; rule_name?: string }[];
    if (!rules.length) {
      return NextResponse.json({ success: false, error: "Rule not found" }, { status: 404 });
    }
    const triggerEvent = String(rules[0].trigger_event ?? "") as AutomationTriggerEvent;

    if (triggerEvent === "agent_went_online" || triggerEvent === "agent_went_offline") {
      const aid = body.agentUserId != null ? Number(body.agentUserId) : NaN;
      if (!Number.isFinite(aid)) {
        return NextResponse.json({ success: false, error: "agentUserId required for this rule" }, { status: 400 });
      }
      const agent = await loadAgentSnapshot(sql, aid);
      if (!agent) {
        return NextResponse.json({ success: false, error: "Agent profile not found" }, { status: 404 });
      }
      const conditions = await loadConditions(sql, ruleId);
      const ctx: AutomationContext = { kind: "agent", agent };
      const matches = evaluateConditions(conditions, ctx);
      const actions = matches ? await loadActions(sql, ruleId) : [];
      return NextResponse.json({
        success: true,
        data: {
          matches,
          triggerEvent,
          wouldRunActions: matches ? actions.map((a) => ({ type: a.action_type, payload: a.payload })) : [],
        },
      });
    }

    const tid = body.ticketId != null ? Number(body.ticketId) : NaN;
    if (!Number.isFinite(tid)) {
      return NextResponse.json({ success: false, error: "ticketId required" }, { status: 400 });
    }
    const ticket = await loadTicketSnapshot(sql, tid);
    if (!ticket) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }
    const conditions = await loadConditions(sql, ruleId);
    const ctx: AutomationContext = { kind: "ticket", ticket };
    const matches = evaluateConditions(conditions, ctx);
    const actions = matches ? await loadActions(sql, ruleId) : [];
    return NextResponse.json({
      success: true,
      data: {
        matches,
        triggerEvent,
        wouldRunActions: matches ? actions.map((a) => ({ type: a.action_type, payload: a.payload })) : [],
      },
    });
  } catch (e) {
    console.error("[POST /api/tickets/automation/rules/[id]/test]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

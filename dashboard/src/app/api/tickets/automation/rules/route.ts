/**
 * GET/POST /api/tickets/automation/rules — workflow automation CRUD (manager).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";

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

export async function GET() {
  const auth = await requireTicketManager();
  if ("error" in auth && auth.error) return auth.error;

  try {
    const sql = getSql();
    const rules = (await sql`
      SELECT r.id, r.rule_code, r.rule_name, r.rule_description, r.rule_priority, r.trigger_event::text AS trigger_event,
             r.is_enabled, r.is_active, r.once_per_ticket, r.stop_after_match,
             r.execution_mode::text AS execution_mode, r.execution_delay_seconds, r.max_action_retries, r.version,
             r.created_at, r.updated_at, r.created_by_user_id, r.updated_by_user_id,
             u.email AS updated_by_email,
             u.full_name AS updated_by_name,
             (SELECT COUNT(*)::int FROM public.ticket_automation_rule_conditions c WHERE c.rule_id = r.id) AS condition_count,
             (SELECT COUNT(*)::int FROM public.ticket_automation_rule_actions a WHERE a.rule_id = r.id) AS action_count,
             COALESCE(
               (
                 SELECT json_agg(
                   json_build_object(
                     'field', c.field,
                     'operator', c.operator,
                     'value', c.value,
                     'combine_with_previous', c.combine_with_previous
                   )
                   ORDER BY c.sort_order, c.id
                 )
                 FROM public.ticket_automation_rule_conditions c
                 WHERE c.rule_id = r.id
               ),
               '[]'::json
             ) AS conditions_preview,
             COALESCE(
               (
                 SELECT json_agg(
                   json_build_object(
                     'action_type', a.action_type,
                     'payload', a.payload,
                     'combine_with_previous', a.combine_with_previous
                   )
                   ORDER BY a.sort_order, a.id
                 )
                 FROM public.ticket_automation_rule_actions a
                 WHERE a.rule_id = r.id
               ),
               '[]'::json
             ) AS actions_preview
      FROM public.ticket_automation_rules r
      LEFT JOIN public.system_users u ON u.id = r.updated_by_user_id
      ORDER BY r.rule_priority DESC, r.id ASC
    `) as Record<string, unknown>[];

    return NextResponse.json(
      { success: true, data: { rules } },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  } catch (e) {
    console.error("[GET /api/tickets/automation/rules]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ticket_automation_rules") && msg.includes("does not exist")) {
      return NextResponse.json(
        {
          success: false,
          error: "Automation tables missing — run dashboard/drizzle/0166_ticket_workflow_automation.sql",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

const TRIGGERS = new Set([
  "ticket_created",
  "ticket_updated",
  "ticket_reopened",
  "agent_went_online",
  "agent_went_offline",
]);
const EXEC_MODES = new Set(["immediate", "queued"]);

export async function POST(request: NextRequest) {
  const auth = await requireTicketManager();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const ruleCode = String(body.ruleCode ?? body.rule_code ?? "").trim();
  const ruleName = String(body.ruleName ?? body.rule_name ?? "").trim();
  const triggerEvent = String(body.triggerEvent ?? body.trigger_event ?? "").trim();
  if (!ruleCode || !ruleName || !triggerEvent || !TRIGGERS.has(triggerEvent)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "ruleCode, ruleName, and triggerEvent (ticket_created|ticket_updated|ticket_reopened|agent_went_online|agent_went_offline) required",
      },
      { status: 400 }
    );
  }

  const rulePriority = Number(body.rulePriority ?? body.rule_priority ?? 0);
  const isEnabled = body.isEnabled !== false && body.is_enabled !== false;
  const isActive = body.isActive !== false && body.is_active !== false;
  const oncePerTicket = body.oncePerTicket === true || body.once_per_ticket === true;
  const stopAfterMatch = body.stopAfterMatch === true || body.stop_after_match === true;
  const executionMode = String(body.executionMode ?? body.execution_mode ?? "immediate").toLowerCase();
  if (!EXEC_MODES.has(executionMode)) {
    return NextResponse.json({ success: false, error: "Invalid executionMode" }, { status: 400 });
  }
  const executionDelaySeconds = Math.max(0, Number(body.executionDelaySeconds ?? body.execution_delay_seconds ?? 0) || 0);
  const maxActionRetries = Math.min(10, Math.max(0, Number(body.maxActionRetries ?? body.max_action_retries ?? 2) || 2));
  const ruleDescription =
    body.ruleDescription != null || body.rule_description != null
      ? String(body.ruleDescription ?? body.rule_description).trim() || null
      : null;

  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  const actions = Array.isArray(body.actions) ? body.actions : [];

  try {
    const sql = getSql();
    const rows = (await sql`
      INSERT INTO public.ticket_automation_rules (
        rule_code, rule_name, rule_description, rule_priority, trigger_event,
        is_enabled, is_active, once_per_ticket, stop_after_match,
        execution_mode, execution_delay_seconds, max_action_retries, version,
        created_by_user_id, updated_by_user_id
      ) VALUES (
        ${ruleCode}, ${ruleName}, ${ruleDescription}, ${Number.isFinite(rulePriority) ? rulePriority : 0}, ${triggerEvent},
        ${isEnabled}, ${isActive}, ${oncePerTicket}, ${stopAfterMatch},
        ${executionMode}, ${executionDelaySeconds}, ${maxActionRetries}, 1,
        ${systemUser.id}, ${systemUser.id}
      )
      RETURNING id
    `) as { id?: unknown }[];
    const ruleId = Number(rows[0]?.id);
    if (!Number.isFinite(ruleId)) {
      return NextResponse.json({ success: false, error: "Insert failed" }, { status: 500 });
    }

    let sort = 0;
    for (const c of conditions) {
      const row = c as Record<string, unknown>;
      const field = String(row.field ?? "").trim();
      const operator = String(row.operator ?? "").trim();
      const value = row.value !== undefined ? row.value : null;
      const rawCombine = String(row.combineWithPrevious ?? row.combine_with_previous ?? "and").toLowerCase();
      const combine = rawCombine === "or" ? "or" : "and";
      if (!field || !operator) continue;
      await sql`
        INSERT INTO public.ticket_automation_rule_conditions (rule_id, sort_order, field, operator, value, combine_with_previous)
        VALUES (${ruleId}, ${sort++}, ${field}, ${operator}, ${JSON.stringify(value)}::jsonb, ${combine})
      `;
    }

    sort = 0;
    for (const a of actions) {
      const row = a as Record<string, unknown>;
      const actionType = String(row.actionType ?? row.action_type ?? "").trim();
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      if (!actionType) continue;
      const rawAc = String(row.combineWithPrevious ?? row.combine_with_previous ?? "and").toLowerCase();
      const actionCombine =
        sort === 0
          ? "and"
          : rawAc === "or"
            ? "or"
            : rawAc === "if" || rawAc === "iff"
              ? "if"
              : "and";
      await sql`
        INSERT INTO public.ticket_automation_rule_actions (rule_id, sort_order, action_type, payload, combine_with_previous)
        VALUES (${ruleId}, ${sort++}, ${actionType}, ${JSON.stringify(payload)}::jsonb, ${actionCombine})
      `;
    }

    const snapshot = JSON.stringify({
      rule: { ruleCode, ruleName, ruleDescription, rulePriority, triggerEvent, isEnabled, isActive, oncePerTicket, stopAfterMatch, executionMode },
      conditions,
      actions,
    });
    await sql`
      INSERT INTO public.ticket_automation_rule_versions (rule_id, version, snapshot, created_by_user_id)
      VALUES (${ruleId}, 1, ${snapshot}::jsonb, ${systemUser.id})
    `;

    await sql`
      INSERT INTO public.ticket_automation_logs (log_type, rule_id, summary, details, actor_user_id)
      VALUES (
        'rule_audit',
        ${ruleId},
        ${`Created rule ${ruleCode}`},
        ${JSON.stringify({ version: 1 })}::jsonb,
        ${systemUser.id}
      )
    `;

    return NextResponse.json({ success: true, data: { id: ruleId } });
  } catch (e) {
    console.error("[POST /api/tickets/automation/rules]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ success: false, error: "ruleCode must be unique" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

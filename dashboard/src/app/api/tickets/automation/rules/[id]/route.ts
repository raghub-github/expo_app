/**
 * GET/PATCH/DELETE /api/tickets/automation/rules/[id]
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

const TRIGGERS = new Set([
  "ticket_created",
  "ticket_updated",
  "ticket_reopened",
  "agent_went_online",
  "agent_went_offline",
]);
const EXEC_MODES = new Set(["immediate", "queued"]);

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTicketManager();
  if ("error" in auth && auth.error) return auth.error;

  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (!Number.isFinite(ruleId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const rules = (await sql`
      SELECT id, rule_code, rule_name, rule_description, rule_priority, trigger_event::text AS trigger_event,
             is_enabled, is_active, once_per_ticket, stop_after_match,
             execution_mode::text AS execution_mode, execution_delay_seconds, max_action_retries, version,
             created_at, updated_at, created_by_user_id, updated_by_user_id
      FROM public.ticket_automation_rules WHERE id = ${ruleId} LIMIT 1
    `) as Record<string, unknown>[];
    if (!rules.length) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const conditions = (await sql`
      SELECT id, rule_id, sort_order, field, operator, value, combine_with_previous
      FROM public.ticket_automation_rule_conditions WHERE rule_id = ${ruleId} ORDER BY sort_order ASC, id ASC
    `) as Record<string, unknown>[];
    const actions = (await sql`
      SELECT id, rule_id, sort_order, action_type, payload, combine_with_previous
      FROM public.ticket_automation_rule_actions WHERE rule_id = ${ruleId} ORDER BY sort_order ASC, id ASC
    `) as Record<string, unknown>[];

    return NextResponse.json({
      success: true,
      data: { rule: rules[0], conditions, actions },
    });
  } catch (e) {
    console.error("[GET /api/tickets/automation/rules/[id]]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTicketManager();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser } = auth;

  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (!Number.isFinite(ruleId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const existing = (await sql`
      SELECT id, version FROM public.ticket_automation_rules WHERE id = ${ruleId} LIMIT 1
    `) as { id?: unknown; version?: unknown }[];
    if (!existing.length) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const nextVersion = Number(existing[0].version ?? 1) + 1;

    const ruleNameRaw =
      body.ruleName !== undefined || body.rule_name !== undefined
        ? String(body.ruleName ?? body.rule_name ?? "").trim()
        : null;
    const ruleDescription =
      body.ruleDescription !== undefined || body.rule_description !== undefined
        ? String(body.ruleDescription ?? body.rule_description ?? "").trim() || null
        : undefined;
    const rulePriority =
      body.rulePriority !== undefined || body.rule_priority !== undefined
        ? Number(body.rulePriority ?? body.rule_priority)
        : undefined;
    const triggerEvent =
      body.triggerEvent != null || body.trigger_event != null
        ? String(body.triggerEvent ?? body.trigger_event).trim()
        : undefined;
    if (triggerEvent !== undefined && !TRIGGERS.has(triggerEvent)) {
      return NextResponse.json({ success: false, error: "Invalid triggerEvent" }, { status: 400 });
    }
    const isEnabled = body.isEnabled !== undefined || body.is_enabled !== undefined ? Boolean(body.isEnabled ?? body.is_enabled) : undefined;
    const isActive = body.isActive !== undefined || body.is_active !== undefined ? Boolean(body.isActive ?? body.is_active) : undefined;
    const oncePerTicket =
      body.oncePerTicket !== undefined || body.once_per_ticket !== undefined
        ? Boolean(body.oncePerTicket ?? body.once_per_ticket)
        : undefined;
    const stopAfterMatch =
      body.stopAfterMatch !== undefined || body.stop_after_match !== undefined
        ? Boolean(body.stopAfterMatch ?? body.stop_after_match)
        : undefined;
    const executionMode =
      body.executionMode != null || body.execution_mode != null
        ? String(body.executionMode ?? body.execution_mode).toLowerCase()
        : undefined;
    if (executionMode !== undefined && !EXEC_MODES.has(executionMode)) {
      return NextResponse.json({ success: false, error: "Invalid executionMode" }, { status: 400 });
    }
    const executionDelaySeconds =
      body.executionDelaySeconds !== undefined || body.execution_delay_seconds !== undefined
        ? Math.max(0, Number(body.executionDelaySeconds ?? body.execution_delay_seconds) || 0)
        : undefined;
    const maxActionRetries =
      body.maxActionRetries !== undefined || body.max_action_retries !== undefined
        ? Math.min(10, Math.max(0, Number(body.maxActionRetries ?? body.max_action_retries) || 0))
        : undefined;

    if (ruleNameRaw !== null) {
      await sql`UPDATE public.ticket_automation_rules SET rule_name = ${ruleNameRaw}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (ruleDescription !== undefined) {
      await sql`UPDATE public.ticket_automation_rules SET rule_description = ${ruleDescription}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (rulePriority !== undefined && Number.isFinite(rulePriority)) {
      await sql`UPDATE public.ticket_automation_rules SET rule_priority = ${rulePriority}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (triggerEvent !== undefined) {
      await sql`UPDATE public.ticket_automation_rules SET trigger_event = ${triggerEvent}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (isEnabled !== undefined) {
      await sql`UPDATE public.ticket_automation_rules SET is_enabled = ${isEnabled}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (isActive !== undefined) {
      await sql`UPDATE public.ticket_automation_rules SET is_active = ${isActive}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (oncePerTicket !== undefined) {
      await sql`UPDATE public.ticket_automation_rules SET once_per_ticket = ${oncePerTicket}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (stopAfterMatch !== undefined) {
      await sql`UPDATE public.ticket_automation_rules SET stop_after_match = ${stopAfterMatch}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (executionMode !== undefined) {
      await sql`UPDATE public.ticket_automation_rules SET execution_mode = ${executionMode}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (executionDelaySeconds !== undefined) {
      await sql`UPDATE public.ticket_automation_rules SET execution_delay_seconds = ${executionDelaySeconds}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }
    if (maxActionRetries !== undefined) {
      await sql`UPDATE public.ticket_automation_rules SET max_action_retries = ${maxActionRetries}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}`;
    }

    if (Array.isArray(body.conditions)) {
      await sql`DELETE FROM public.ticket_automation_rule_conditions WHERE rule_id = ${ruleId}`;
      let sort = 0;
      for (const c of body.conditions) {
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
    }

    if (Array.isArray(body.actions)) {
      await sql`DELETE FROM public.ticket_automation_rule_actions WHERE rule_id = ${ruleId}`;
      let sort = 0;
      for (const a of body.actions) {
        const row = a as Record<string, unknown>;
        const actionType = String(row.actionType ?? row.action_type ?? "").trim();
        const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
        if (!actionType) continue;
        await sql`
          INSERT INTO public.ticket_automation_rule_actions (rule_id, sort_order, action_type, payload)
          VALUES (${ruleId}, ${sort++}, ${actionType}, ${JSON.stringify(payload)}::jsonb)
        `;
      }
    }

    await sql`
      UPDATE public.ticket_automation_rules SET version = ${nextVersion}, updated_by_user_id = ${systemUser.id} WHERE id = ${ruleId}
    `;

    const full = (await sql`
      SELECT rule_code, rule_name, rule_description, rule_priority, trigger_event::text AS trigger_event,
             is_enabled, is_active, once_per_ticket, stop_after_match, execution_mode::text AS execution_mode
      FROM public.ticket_automation_rules WHERE id = ${ruleId} LIMIT 1
    `) as Record<string, unknown>[];
    const conds = [...(await sql`SELECT field, operator, value FROM public.ticket_automation_rule_conditions WHERE rule_id = ${ruleId}`)];
    const acts = [
      ...(await sql`
        SELECT action_type, payload, combine_with_previous
        FROM public.ticket_automation_rule_actions WHERE rule_id = ${ruleId}
        ORDER BY sort_order ASC, id ASC
      `),
    ];

    const snapshot = JSON.stringify({ rule: full[0], conditions: conds, actions: acts });
    await sql`
      INSERT INTO public.ticket_automation_rule_versions (rule_id, version, snapshot, created_by_user_id)
      VALUES (${ruleId}, ${nextVersion}, ${snapshot}::jsonb, ${systemUser.id})
    `;

    await sql`
      INSERT INTO public.ticket_automation_logs (log_type, rule_id, summary, details, actor_user_id)
      VALUES (
        'rule_audit',
        ${ruleId},
        ${`Updated rule v${nextVersion}`},
        ${JSON.stringify({ version: nextVersion })}::jsonb,
        ${systemUser.id}
      )
    `;

    return NextResponse.json({ success: true, data: { id: ruleId, version: nextVersion } });
  } catch (e) {
    console.error("[PATCH /api/tickets/automation/rules/[id]]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTicketManager();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser } = auth;

  const { id } = await params;
  const ruleId = parseInt(id, 10);
  if (!Number.isFinite(ruleId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const del = (await sql`
      DELETE FROM public.ticket_automation_rules WHERE id = ${ruleId} RETURNING id
    `) as { id?: unknown }[];
    if (!del.length) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    await sql`
      INSERT INTO public.ticket_automation_logs (log_type, summary, details, actor_user_id)
      VALUES (
        'rule_audit',
        ${`Deleted rule id ${ruleId}`},
        '{}'::jsonb,
        ${systemUser.id}
      )
    `;
    return NextResponse.json({ success: true, data: { id: ruleId } });
  } catch (e) {
    console.error("[DELETE /api/tickets/automation/rules/[id]]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

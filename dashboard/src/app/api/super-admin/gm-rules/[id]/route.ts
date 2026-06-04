import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  cloneGmRule,
  getGmRuleById,
  getGmRuleForEdit,
  isGmRuleEngineMigrated,
  simulateGmRule,
  updateGmRule,
} from "@/lib/db/operations/gm-rule-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  rule_name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  scenario_type: z.string().optional(),
  priority: z.number().int().optional(),
  active_status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED", "DRAFT"]).optional(),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  change_reason: z.string().optional().nullable(),
  conditions: z
    .object({
      service_type: z.string().optional().nullable(),
      order_stage: z.string().optional().nullable(),
      cancellation_reason_id: z.number().optional().nullable(),
      triggered_by: z.string().optional().nullable(),
    })
    .optional(),
  fault: z.record(z.string(), z.unknown()).optional(),
  liability: z.record(z.string(), z.unknown()).optional(),
  refund: z.record(z.string(), z.unknown()).optional(),
  merchant: z.record(z.string(), z.unknown()).optional(),
  rider: z.record(z.string(), z.unknown()).optional(),
  customer_penalty: z.record(z.string(), z.unknown()).optional(),
  funding: z.record(z.string(), z.unknown()).optional(),
  limits: z.record(z.string(), z.unknown()).optional(),
  auto_actions: z.record(z.string(), z.unknown()).optional(),
  fraud: z.record(z.string(), z.unknown()).optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
  approvals: z.array(z.record(z.string(), z.unknown())).optional(),
  advanced: z.record(z.string(), z.unknown()).optional(),
});

const cloneSchema = z.object({
  new_rule_code: z.string().min(1).max(80),
});

const simulateSchema = z.object({
  scenario_type: z.string().min(1),
  service_type: z.string().min(1),
  order_stage: z.string().min(1),
  cancellation_reason_id: z.number().optional().nullable(),
  triggered_by: z.string().optional().nullable(),
  order_gross: z.number().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    if (!(await isGmRuleEngineMigrated())) {
      return NextResponse.json({ success: false, error: "Migration required" }, { status: 503 });
    }
    const row = await getGmRuleForEdit(id);
    if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Load failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const row = await updateGmRule(id, parsed.data, null);
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok for some actions */
  }

  try {
    if (action === "clone") {
      const parsed = cloneSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "new_rule_code required" }, { status: 400 });
      }
      const row = await cloneGmRule(id, parsed.data.new_rule_code, null);
      return NextResponse.json({ success: true, row });
    }

    if (action === "simulate") {
      const parsed = simulateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }
      const result = await simulateGmRule({
        ...parsed.data,
        actor_system_user_id: null,
      });
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Action failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  archiveGmRules,
  createGmRule,
  getGmRuleEngineCatalogs,
  isGmRuleEngineMigrated,
  listGmRules,
  setGmRuleStatus,
} from "@/lib/db/operations/gm-rule-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gmRuleBodySchema = z.object({
  rule_code: z.string().min(1).max(80).optional(),
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

const createSchema = gmRuleBodySchema.extend({
  rule_code: z.string().min(1).max(80),
  rule_name: z.string().min(1).max(200),
  scenario_type: z.string().min(1),
});

const updateSchema = gmRuleBodySchema;

const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  action: z.enum(["enable", "disable", "archive"]),
  change_reason: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const catalogsOnly = searchParams.get("catalogs") === "1";

  try {
    const migrated = await isGmRuleEngineMigrated();
    if (!migrated) {
      return NextResponse.json({
        success: true,
        migrationRequired: true,
        rows: [],
        message: "Run migration backend/drizzle/0246_gm_financial_rule_engine.sql on Supabase.",
      });
    }

    if (catalogsOnly) {
      const catalogs = await getGmRuleEngineCatalogs();
      return NextResponse.json({ success: true, migrationRequired: false, catalogs });
    }

    const [rows, catalogs] = await Promise.all([
      listGmRules({
        scenarioType: searchParams.get("scenario_type") ?? undefined,
        activeStatus: searchParams.get("active_status") ?? undefined,
      }),
      getGmRuleEngineCatalogs(),
    ]);
    return NextResponse.json({ success: true, migrationRequired: false, rows, catalogs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load rules";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const migrated = await isGmRuleEngineMigrated();
    if (!migrated) {
      return NextResponse.json(
        { success: false, error: "Rule engine migration not applied" },
        { status: 503 }
      );
    }
    const row = await createGmRule(parsed.data, null);
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { ids, action, change_reason } = parsed.data;
    if (action === "archive") {
      await archiveGmRules(ids, null);
    } else {
      await setGmRuleStatus(
        ids,
        action === "enable" ? "ACTIVE" : "INACTIVE",
        null,
        change_reason
      );
    }
    const rows = await listGmRules();
    return NextResponse.json({ success: true, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bulk operation failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

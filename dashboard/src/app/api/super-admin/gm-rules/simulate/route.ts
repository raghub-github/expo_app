import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { isGmRuleEngineMigrated, simulateGmRule } from "@/lib/db/operations/gm-rule-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const simulateSchema = z.object({
  scenario_type: z.string().min(1),
  service_type: z.string().min(1),
  order_stage: z.string().min(1),
  cancellation_reason_id: z.number().optional().nullable(),
  triggered_by: z.string().optional().nullable(),
  order_gross: z.number().optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = simulateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if (!(await isGmRuleEngineMigrated())) {
      return NextResponse.json({ success: false, error: "Migration required" }, { status: 503 });
    }
    const result = await simulateGmRule({ ...parsed.data, actor_system_user_id: null });
    return NextResponse.json({ success: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Simulation failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

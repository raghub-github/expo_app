import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";
import { isGmRuleEngineMigrated } from "@/lib/db/operations/gm-rule-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  try {
    if (!(await isGmRuleEngineMigrated())) {
      return NextResponse.json({ success: false, error: "Migration required" }, { status: 503 });
    }
    const sql = getSql();
    const rows = await sql`
      SELECT a.*, e.rule_code, e.core_order_id, e.scenario_type AS exec_scenario
      FROM gm_rule_pending_approvals a
      JOIN gm_rule_execution_log e ON e.id = a.execution_log_id
      WHERE a.status = 'PENDING'
      ORDER BY a.created_at ASC
      LIMIT 200
    `;
    return NextResponse.json({ success: true, rows });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const approvalId = Number(body.approvalId);
  const action = String(body.action ?? "approve");
  const notes = body.notes ? String(body.notes) : null;

  if (!Number.isFinite(approvalId)) {
    return NextResponse.json({ success: false, error: "approvalId required" }, { status: 400 });
  }

  try {
    const sql = getSql();
    if (action === "approve") {
      const rows = await sql`
        SELECT gm_approve_execution(${approvalId}, NULL, ${notes})::jsonb AS result
      `;
      return NextResponse.json({ success: true, result: (rows[0] as { result?: unknown })?.result });
    }
    await sql`
      UPDATE gm_rule_pending_approvals SET
        status = 'REJECTED',
        rejection_reason = ${notes ?? "Rejected"},
        updated_at = NOW()
      WHERE id = ${approvalId}
    `;
    return NextResponse.json({ success: true, action: "rejected" });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

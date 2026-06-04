import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 100), 500);
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM v_gm_rule_execution_report
    ORDER BY executed_at DESC
    LIMIT ${limit}
  `.catch(async () => {
    return sql`
      SELECT * FROM gm_rule_execution_log ORDER BY executed_at DESC LIMIT ${limit}
    `;
  });
  return NextResponse.json({ success: true, rows });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  party_type: z.enum(["CUSTOMER", "MERCHANT", "RIDER", "PLATFORM"]),
  party_id: z.number().int(),
  order_id: z.number().int().optional(),
  core_order_id: z.string().optional(),
  dispute_type: z.string().min(1),
  claimed_amount: z.number().optional(),
  execution_log_id: z.number().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const status = new URL(req.url).searchParams.get("status") ?? "OPEN";
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM gm_disputes
    WHERE (${status} = 'ALL' OR status::text = ${status})
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return NextResponse.json({ success: true, rows });
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
  }

  const d = parsed.data;
  const sql = getSql();
  const rows = await sql`
    SELECT gm_create_dispute(
      ${d.party_type}::gm_dispute_party,
      ${d.party_id},
      ${d.order_id ?? null},
      ${d.core_order_id ?? null},
      ${d.dispute_type},
      ${d.claimed_amount ?? null},
      ${d.execution_log_id ?? null}
    ) AS id
  `;
  return NextResponse.json({ success: true, id: (rows[0] as { id?: number })?.id });
}

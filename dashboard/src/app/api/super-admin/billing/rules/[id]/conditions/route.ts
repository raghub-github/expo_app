import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { insertBillingCondition, listBillingConditions } from "@/lib/db/operations/billing-admin";

export const runtime = "nodejs";

const postSchema = z.object({
  condition_type: z.string().min(1),
  operator: z.string().min(1),
  value_min: z.number().nullable().optional(),
  value_max: z.number().nullable().optional(),
  value_text: z.string().nullable().optional(),
  value_json: z.unknown().optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const ruleId = parseInt(idStr, 10);
  if (!Number.isInteger(ruleId) || ruleId < 1) {
    return NextResponse.json({ error: "Invalid rule id" }, { status: 400 });
  }
  try {
    const conditions = await listBillingConditions(ruleId);
    return NextResponse.json({ conditions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list conditions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const ruleId = parseInt(idStr, 10);
  if (!Number.isInteger(ruleId) || ruleId < 1) {
    return NextResponse.json({ error: "Invalid rule id" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const row = await insertBillingCondition(ruleId, parsed.data);
    return NextResponse.json({ condition: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create condition";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

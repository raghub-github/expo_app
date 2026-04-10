import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { deleteGeoPricingRule, updateGeoPricingRule } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

const patchSchema = z.object({
  ruleType: z.string().min(1),
  valueNumeric: z.number().nullable(),
  valueJson: z.unknown(),
  priority: z.number().int(),
  isActive: z.boolean(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const rule = await updateGeoPricingRule(id, parsed.data);
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const ok = await deleteGeoPricingRule(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

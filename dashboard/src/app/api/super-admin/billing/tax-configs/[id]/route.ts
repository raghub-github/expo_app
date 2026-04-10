import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { deleteTaxConfig, updateTaxConfig } from "@/lib/db/operations/billing-reference";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().optional(),
    rate: z.number().optional(),
    applicable_base: z.string().optional(),
    tax_group: z.string().nullable().optional(),
    priority: z.number().int().optional(),
    is_active: z.boolean().optional(),
    is_hidden: z.boolean().optional(),
    service_type: z.string().optional(),
    metadata: z.unknown().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) {
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
    const row = await updateTaxConfig(id, parsed.data);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ taxConfig: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const conflict =
      msg.includes("already exists for service") || msg.includes("duplicate key value");
    return NextResponse.json({ error: msg }, { status: conflict ? 409 : 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const ok = await deleteTaxConfig(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

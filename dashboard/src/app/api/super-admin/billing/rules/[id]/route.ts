import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  type BillingRuleAdminRow,
  deleteBillingRule,
  getBillingRule,
  type InsertBillingRuleInput,
  updateBillingRuleFull,
} from "@/lib/db/operations/billing-admin";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().optional().nullable(),
    type: z.string().min(1).optional(),
    calculation_type: z.string().min(1).optional(),
    value_numeric: z.number().nullable().optional(),
    value_json: z.unknown().optional(),
    priority: z.number().optional(),
    is_active: z.boolean().optional(),
    stackable: z.boolean().optional(),
    applies_to: z.string().optional(),
    offer_owner: z.string().optional(),
    is_hidden: z.boolean().optional(),
    metadata: z.unknown().optional(),
    service_type: z.string().optional(),
    discount_applies_on: z.string().optional(),
    charge_subtype: z.string().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

function mergeBillingRulePatch(existing: BillingRuleAdminRow, patch: z.infer<typeof patchSchema>): InsertBillingRuleInput {
  const existingNum =
    existing.value_numeric != null && existing.value_numeric !== ""
      ? parseFloat(existing.value_numeric)
      : null;
  return {
    name: patch.name !== undefined ? patch.name : existing.name,
    type: patch.type ?? existing.type,
    calculation_type: patch.calculation_type ?? existing.calculation_type,
    value_numeric: patch.value_numeric !== undefined ? patch.value_numeric : existingNum,
    value_json: patch.value_json !== undefined ? patch.value_json : existing.value_json,
    priority: patch.priority ?? existing.priority,
    is_active: patch.is_active ?? existing.is_active,
    stackable: patch.stackable ?? existing.stackable,
    applies_to: patch.applies_to ?? existing.applies_to,
    offer_owner: patch.offer_owner ?? existing.offer_owner,
    is_hidden: patch.is_hidden ?? existing.is_hidden,
    metadata: patch.metadata !== undefined ? patch.metadata : existing.metadata,
    service_type: patch.service_type ?? existing.service_type,
    discount_applies_on: patch.discount_applies_on ?? existing.discount_applies_on ?? "ITEMS_TOTAL",
    charge_subtype: patch.charge_subtype !== undefined ? patch.charge_subtype : existing.charge_subtype ?? null,
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const row = await getBillingRule(id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

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
    const existing = await getBillingRule(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = await updateBillingRuleFull(id, mergeBillingRulePatch(existing, parsed.data));
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule: row });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : "Failed to update";
    const conflict =
      msg.includes("already exists for this service scope") ||
      msg.includes("duplicate key") ||
      msg.includes("unique constraint");
    if (process.env.NODE_ENV === "development") {
      console.error("[PATCH /api/super-admin/billing/rules/:id]", e);
    }
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
    const ok = await deleteBillingRule(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

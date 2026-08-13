import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteDynamicPricingRule,
  getDynamicPricingRuleById,
  updateDynamicPricingRule,
} from "@/lib/db/operations/dynamic-pricing-admin";

export const runtime = "nodejs";

const patchSchema = z.object({
  vehicleType: z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]).nullable().optional(),
  name: z.string().max(120).nullable().optional(),
  valueType: z.enum(["FIXED", "PER_KM", "PERCENTAGE", "MULTIPLIER"]).optional(),
  value: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().nullable().optional(),
  funding: z.enum(["customer", "company", "shared"]).optional(),
  customerSharePct: z.number().min(0).max(100).optional(),
  taxable: z.boolean().optional(),
  gstRate: z.number().min(0).max(1).optional(),
  allDay: z.boolean().optional(),
  startTime: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/).nullable().optional(),
  endTime: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/).nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  activeFrom: z.string().datetime().nullable().optional(),
  activeTo: z.string().datetime().nullable().optional(),
  manualActive: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

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
    const current = await getDynamicPricingRuleById(id);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const p = parsed.data;
    const merged = {
      vehicleType: p.vehicleType === undefined ? current.vehicleType : p.vehicleType,
      name: p.name === undefined ? current.name : p.name,
      valueType: p.valueType ?? current.valueType,
      value: p.value ?? current.value,
      maxAmount: p.maxAmount === undefined ? current.maxAmount : p.maxAmount,
      funding: p.funding ?? current.funding,
      customerSharePct: p.customerSharePct ?? current.customerSharePct,
      taxable: p.taxable ?? current.taxable,
      gstRate: p.gstRate ?? current.gstRate,
      allDay: p.allDay ?? current.allDay,
      startTime: p.startTime === undefined ? current.startTime : p.startTime,
      endTime: p.endTime === undefined ? current.endTime : p.endTime,
      daysOfWeek: p.daysOfWeek === undefined ? current.daysOfWeek : p.daysOfWeek,
      activeFrom: p.activeFrom === undefined ? current.activeFrom : p.activeFrom,
      activeTo: p.activeTo === undefined ? current.activeTo : p.activeTo,
      manualActive: p.manualActive ?? current.manualActive,
      priority: p.priority ?? current.priority,
      isActive: p.isActive ?? current.isActive,
    };
    if (merged.funding === "shared" && (merged.customerSharePct <= 0 || merged.customerSharePct >= 100)) {
      return NextResponse.json({ error: "customerSharePct must be 0–100 (exclusive) for shared funding" }, { status: 400 });
    }
    if (!merged.taxable) merged.gstRate = 0;
    const rule = await updateDynamicPricingRule(id, merged);
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    const ok = await deleteDynamicPricingRule(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}

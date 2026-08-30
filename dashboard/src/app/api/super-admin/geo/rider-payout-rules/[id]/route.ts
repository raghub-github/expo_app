import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getServicePayoutRuleById,
  softDeleteServicePayoutRule,
  updateServicePayoutRule,
} from "@/lib/db/operations/service-payout-rules-admin";

export const runtime = "nodejs";

const patchSchema = z.object({
  vehicleType: z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]).optional().nullable(),
  riderPercentage: z.number().gt(0).lte(100).optional(),
  platformPercentage: z.number().gte(0).lt(100).optional(),
  waitingChargePerMin: z.number().nonnegative().optional().nullable(),
  waitingFreeMinutes: z.number().int().nonnegative().optional(),
  waitingMaxCharge: z.number().nonnegative().optional().nullable(),
  waitingMaxMinutes: z.number().int().nonnegative().optional().nullable(),
  waitingStartMode: z.enum(["FIXED_GRACE", "KPT_PLUS_GRACE"]).optional(),
  waitingKptGraceMinutes: z.number().int().nonnegative().optional().nullable(),
  waitingBulkValueThreshold: z.number().nonnegative().optional().nullable(),
  waitingBulkItemThreshold: z.number().int().nonnegative().optional().nullable(),
  waitingBulkExtraGraceMinutes: z.number().int().nonnegative().optional().nullable(),
  waitingFundingMode: z.enum(["CUSTOMER_100", "COMPANY_100", "MERCHANT_100", "SHARED"]).optional(),
  waitingCustomerSharePct: z.number().min(0).max(100).optional(),
  waitingCompanySharePct: z.number().min(0).max(100).optional(),
  priority: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
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
    const current = await getServicePayoutRuleById(id);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const merged = {
      vehicleType: parsed.data.vehicleType === undefined ? current.vehicleType : parsed.data.vehicleType,
      riderPercentage: parsed.data.riderPercentage ?? current.riderPercentage,
      platformPercentage: parsed.data.platformPercentage ?? current.platformPercentage,
      waitingChargePerMin:
        parsed.data.waitingChargePerMin === undefined ? current.waitingChargePerMin : parsed.data.waitingChargePerMin,
      waitingFreeMinutes: parsed.data.waitingFreeMinutes ?? current.waitingFreeMinutes,
      waitingMaxCharge:
        parsed.data.waitingMaxCharge === undefined ? current.waitingMaxCharge : parsed.data.waitingMaxCharge,
      waitingMaxMinutes:
        parsed.data.waitingMaxMinutes === undefined ? current.waitingMaxMinutes : parsed.data.waitingMaxMinutes,
      waitingStartMode: parsed.data.waitingStartMode ?? current.waitingStartMode,
      waitingKptGraceMinutes:
        parsed.data.waitingKptGraceMinutes === undefined ? current.waitingKptGraceMinutes : parsed.data.waitingKptGraceMinutes,
      waitingBulkValueThreshold:
        parsed.data.waitingBulkValueThreshold === undefined ? current.waitingBulkValueThreshold : parsed.data.waitingBulkValueThreshold,
      waitingBulkItemThreshold:
        parsed.data.waitingBulkItemThreshold === undefined ? current.waitingBulkItemThreshold : parsed.data.waitingBulkItemThreshold,
      waitingBulkExtraGraceMinutes:
        parsed.data.waitingBulkExtraGraceMinutes === undefined ? current.waitingBulkExtraGraceMinutes : parsed.data.waitingBulkExtraGraceMinutes,
      waitingFundingMode: parsed.data.waitingFundingMode ?? current.waitingFundingMode,
      waitingCustomerSharePct: parsed.data.waitingCustomerSharePct ?? current.waitingCustomerSharePct,
      waitingCompanySharePct: parsed.data.waitingCompanySharePct ?? current.waitingCompanySharePct,
      priority: parsed.data.priority ?? current.priority,
      isActive: parsed.data.isActive ?? current.isActive,
      effectiveFrom: parsed.data.effectiveFrom === undefined ? current.effectiveFrom : parsed.data.effectiveFrom,
      effectiveTo: parsed.data.effectiveTo === undefined ? current.effectiveTo : parsed.data.effectiveTo,
    };

    if (Math.round((merged.riderPercentage + merged.platformPercentage) * 100) !== 10000) {
      return NextResponse.json(
        { error: "riderPercentage + platformPercentage must equal 100" },
        { status: 400 }
      );
    }
    if (current.serviceType === "food" && merged.vehicleType) {
      return NextResponse.json({ error: "Food has no vehicle dimension — leave vehicle unset." }, { status: 400 });
    }

    const rule = await updateServicePayoutRule(id, merged);
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
    const ok = await softDeleteServicePayoutRule(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertServicePayoutRule,
  listServicePayoutRules,
  type RiderPayoutServiceType,
} from "@/lib/db/operations/service-payout-rules-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const serviceSchema = z.enum(["food", "parcel", "ride"]);
const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);
const waitingFundingSchema = z.enum(["CUSTOMER_100", "COMPANY_100", "MERCHANT_100", "SHARED"]);
const waitingStartModeSchema = z.enum(["FIXED_GRACE", "KPT_PLUS_GRACE"]);

const ruleBodySchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  service: serviceSchema,
  /** NULL/omitted = applies to all vehicles. Only meaningful for parcel/ride. */
  vehicleType: vehicleSchema.optional().nullable(),
  riderPercentage: z.number().gt(0).lte(100),
  platformPercentage: z.number().gte(0).lt(100),
  waitingChargePerMin: z.number().nonnegative().optional().nullable(),
  waitingFreeMinutes: z.number().int().nonnegative().optional(),
  waitingMaxCharge: z.number().nonnegative().optional().nullable(),
  waitingMaxMinutes: z.number().int().nonnegative().optional().nullable(),
  waitingStartMode: waitingStartModeSchema.optional(),
  waitingKptGraceMinutes: z.number().int().nonnegative().optional().nullable(),
  waitingBulkValueThreshold: z.number().nonnegative().optional().nullable(),
  waitingBulkItemThreshold: z.number().int().nonnegative().optional().nullable(),
  waitingBulkExtraGraceMinutes: z.number().int().nonnegative().optional().nullable(),
  waitingFundingMode: waitingFundingSchema.optional(),
  waitingCustomerSharePct: z.number().min(0).max(100).optional(),
  waitingCompanySharePct: z.number().min(0).max(100).optional(),
  priority: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
});

function validatePercentages(riderPct: number, platformPct: number): string | null {
  if (Math.round((riderPct + platformPct) * 100) !== 10000) {
    return "riderPercentage + platformPercentage must equal 100";
  }
  return null;
}

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  const service = serviceSchema.safeParse(sp.get("service"));

  if (!level.success || !refId || !service.success) {
    return NextResponse.json({ error: "level, refId, service required" }, { status: 400 });
  }

  try {
    const rules = await listServicePayoutRules({
      level: level.data,
      refId,
      service: service.data as RiderPayoutServiceType,
    });
    return NextResponse.json({ rules });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ruleBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const pctError = validatePercentages(parsed.data.riderPercentage, parsed.data.platformPercentage);
  if (pctError) return NextResponse.json({ error: pctError }, { status: 400 });
  if (parsed.data.service === "food" && parsed.data.vehicleType) {
    return NextResponse.json({ error: "Food has no vehicle dimension — leave vehicle unset." }, { status: 400 });
  }
  if (
    parsed.data.waitingFundingMode === "SHARED" &&
    (parsed.data.waitingCustomerSharePct ?? 100) <= 0 &&
    (parsed.data.waitingCompanySharePct ?? 0) <= 0
  ) {
    return NextResponse.json({ error: "Shared waiting funding needs a nonzero customer or company share" }, { status: 400 });
  }

  try {
    const rule = await insertServicePayoutRule({
      level: parsed.data.level,
      refId: parsed.data.refId,
      service: parsed.data.service as RiderPayoutServiceType,
      vehicleType: parsed.data.vehicleType ?? null,
      riderPercentage: parsed.data.riderPercentage,
      platformPercentage: parsed.data.platformPercentage,
      waitingChargePerMin: parsed.data.waitingChargePerMin ?? null,
      waitingFreeMinutes: parsed.data.waitingFreeMinutes ?? 2,
      waitingMaxCharge: parsed.data.waitingMaxCharge ?? null,
      waitingMaxMinutes: parsed.data.waitingMaxMinutes ?? null,
      waitingStartMode: parsed.data.waitingStartMode ?? "FIXED_GRACE",
      waitingKptGraceMinutes: parsed.data.waitingKptGraceMinutes ?? null,
      waitingBulkValueThreshold: parsed.data.waitingBulkValueThreshold ?? null,
      waitingBulkItemThreshold: parsed.data.waitingBulkItemThreshold ?? null,
      waitingBulkExtraGraceMinutes: parsed.data.waitingBulkExtraGraceMinutes ?? null,
      waitingFundingMode: parsed.data.waitingFundingMode ?? "CUSTOMER_100",
      waitingCustomerSharePct: parsed.data.waitingCustomerSharePct ?? 100,
      waitingCompanySharePct: parsed.data.waitingCompanySharePct ?? 0,
      priority: parsed.data.priority ?? 100,
      isActive: parsed.data.isActive ?? true,
      effectiveFrom: parsed.data.effectiveFrom ?? null,
      effectiveTo: parsed.data.effectiveTo ?? null,
    });
    return NextResponse.json({ rule });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Insert failed" }, { status: 500 });
  }
}

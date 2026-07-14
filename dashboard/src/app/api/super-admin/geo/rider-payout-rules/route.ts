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

const ruleBodySchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  service: serviceSchema,
  riderPercentage: z.number().gt(0).lte(100),
  platformPercentage: z.number().gte(0).lt(100),
  waitingChargePerMin: z.number().nonnegative().optional().nullable(),
  waitingFreeMinutes: z.number().int().nonnegative().optional(),
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

  try {
    const rule = await insertServicePayoutRule({
      level: parsed.data.level,
      refId: parsed.data.refId,
      service: parsed.data.service as RiderPayoutServiceType,
      riderPercentage: parsed.data.riderPercentage,
      platformPercentage: parsed.data.platformPercentage,
      waitingChargePerMin: parsed.data.waitingChargePerMin ?? null,
      waitingFreeMinutes: parsed.data.waitingFreeMinutes ?? 2,
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

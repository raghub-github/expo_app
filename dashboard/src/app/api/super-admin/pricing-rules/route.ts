import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertPricingRule,
  listPricingRules,
  type PricingRuleType,
} from "@/lib/db/operations/pricing-rules-admin";

export const runtime = "nodejs";

const ruleTypeEnum = z.enum([
  "customer_delivery_fee",
  "rider_payout",
  "surge_pricing",
  "discount",
  "commission",
]);

const listQuerySchema = z.object({
  level: z.string().min(2),
  refId: z.string().uuid(),
  ruleType: ruleTypeEnum.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const createBodySchema = z.object({
  ruleType: ruleTypeEnum,
  serviceType: z.enum(["food", "parcel", "ride"]),
  level: z.string().min(2),
  refId: z.string().uuid(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  actions: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
  override: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const parsed = listQuerySchema.safeParse({
    level: sp.get("level") ?? "",
    refId: sp.get("refId") ?? sp.get("ref_id") ?? "",
    ruleType: sp.get("ruleType") ?? sp.get("rule_type") ?? undefined,
    limit: sp.get("limit") ?? undefined,
    offset: sp.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const rules = await listPricingRules({
      level: parsed.data.level,
      refId: parsed.data.refId,
      ruleType: parsed.data.ruleType as PricingRuleType | undefined,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return NextResponse.json({ rules });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "List failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const rule = await insertPricingRule({
      ruleType: parsed.data.ruleType,
      serviceType: parsed.data.serviceType,
      level: parsed.data.level,
      refId: parsed.data.refId,
      conditions: parsed.data.conditions ?? {},
      actions: parsed.data.actions ?? {},
      priority: parsed.data.priority,
      isActive: parsed.data.isActive,
      override: parsed.data.override,
    });
    return NextResponse.json({ rule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

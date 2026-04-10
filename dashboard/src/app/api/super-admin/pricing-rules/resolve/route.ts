import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  resolvePricingRulesDb,
  resolvePricingTotalsDb,
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

const bodySchema = z.object({
  pincode: z.string().min(3).max(12),
  service: z.enum(["food", "parcel", "ride"]),
  ruleType: ruleTypeEnum,
  context: z.record(z.string(), z.unknown()).optional(),
  withTotals: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const ctx = parsed.data.context ?? {};
  try {
    if (parsed.data.withTotals) {
      const result = await resolvePricingTotalsDb({
        pincode: parsed.data.pincode,
        service: parsed.data.service,
        ruleType: parsed.data.ruleType as PricingRuleType,
        context: ctx,
      });
      return NextResponse.json(result);
    }
    const result = await resolvePricingRulesDb({
      pincode: parsed.data.pincode,
      service: parsed.data.service,
      ruleType: parsed.data.ruleType as PricingRuleType,
      context: ctx,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resolve failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

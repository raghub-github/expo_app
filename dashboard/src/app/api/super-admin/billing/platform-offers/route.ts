import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { platformOfferKindSchema } from "@/lib/billing/platformOfferKinds";
import { validatePlatformOfferKindFieldsForApi } from "@/lib/billing/platformOfferKindUi";
import { insertPlatformOffer, listPlatformOffers } from "@/lib/db/operations/billing-advanced";

export const runtime = "nodejs";

const offerAudienceSchema = z.enum(["CUSTOMER", "MERCHANT", "RIDER"]);

const postSchema = z.object({
  name: z.string().optional().nullable(),
  service_type: z.string().optional(),
  offer_kind: platformOfferKindSchema.optional(),
  offer_audience: offerAudienceSchema.optional(),
  funding_mode: z.string().optional(),
  platform_share_pct: z.number().min(0).max(100).optional(),
  merchant_share_pct: z.number().min(0).max(100).optional(),
  max_platform_contribution: z.number().nullable().optional(),
  max_merchant_contribution: z.number().nullable().optional(),
  target_scope: z.string().optional(),
  geo_level: z.string().nullable().optional(),
  geo_ids: z.array(z.string()).optional(),
  merchant_ids: z.array(z.number().int()).optional(),
  customer_segment: z.string().optional(),
  min_order_amount: z.number().nullable().optional(),
  max_discount_amount: z.number().nullable().optional(),
  buy_qty: z.number().int().nullable().optional(),
  get_qty: z.number().int().nullable().optional(),
  is_stackable: z.boolean().optional(),
  exclusion_group: z.string().nullable().optional(),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  budget_total: z.number().nullable().optional(),
  budget_used: z.number().nullable().optional(),
  discount_type: z.string().optional(),
  value_numeric: z.number().nullable().optional(),
  delivery_discount_type: z.string().optional().nullable(),
  delivery_discount_value: z.number().nullable().optional(),
  priority: z.number().int().optional(),
  is_active: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  metadata: z.unknown().optional(),
}).superRefine((d, ctx) => {
  const p = d.platform_share_pct ?? 100;
  const m = d.merchant_share_pct ?? 0;
  if (Math.round((p + m) * 100) !== 10000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "platform_share_pct + merchant_share_pct must equal 100",
      path: ["platform_share_pct"],
    });
  }
  const kindErr = validatePlatformOfferKindFieldsForApi({
    offer_kind: d.offer_kind,
    buy_qty: d.buy_qty,
    get_qty: d.get_qty,
    conditions: d.conditions,
    discount_type: d.discount_type,
    value_numeric: d.value_numeric,
    delivery_discount_type: d.delivery_discount_type,
  });
  if (kindErr) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: kindErr, path: ["offer_kind"] });
  }
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const offers = await listPlatformOffers();
    return NextResponse.json({ offers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const offer = await insertPlatformOffer(parsed.data);
    return NextResponse.json({ offer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { platformOfferKindSchema } from "@/lib/billing/platformOfferKinds";
import { validatePlatformOfferKindFieldsForApi } from "@/lib/billing/platformOfferKindUi";
import { deletePlatformOffer, listPlatformOffers, updatePlatformOffer } from "@/lib/db/operations/billing-advanced";

export const runtime = "nodejs";

const offerAudienceSchema = z.enum(["CUSTOMER", "MERCHANT", "RIDER"]);

const patchSchema = z
  .object({
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
    if (d.platform_share_pct !== undefined || d.merchant_share_pct !== undefined) {
      const p = d.platform_share_pct ?? 100;
      const m = d.merchant_share_pct ?? 0;
      if (Math.round((p + m) * 100) !== 10000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "platform_share_pct + merchant_share_pct must equal 100",
          path: ["platform_share_pct"],
        });
      }
    }
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
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
    const existing = await listPlatformOffers();
    const row0 = existing.find((o) => o.id === id);
    if (!row0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const cond =
      parsed.data.conditions !== undefined
        ? parsed.data.conditions
        : row0.conditions && typeof row0.conditions === "object"
          ? (row0.conditions as Record<string, unknown>)
          : {};
    const merged = {
      name: parsed.data.name ?? row0.name,
      service_type: parsed.data.service_type ?? row0.service_type,
      offer_kind: parsed.data.offer_kind ?? row0.offer_kind,
      offer_audience: parsed.data.offer_audience ?? row0.offer_audience ?? "CUSTOMER",
      funding_mode: parsed.data.funding_mode ?? row0.funding_mode,
      platform_share_pct:
        parsed.data.platform_share_pct !== undefined ? parsed.data.platform_share_pct : parseFloat(row0.platform_share_pct ?? "100"),
      merchant_share_pct:
        parsed.data.merchant_share_pct !== undefined ? parsed.data.merchant_share_pct : parseFloat(row0.merchant_share_pct ?? "0"),
      max_platform_contribution:
        parsed.data.max_platform_contribution !== undefined
          ? parsed.data.max_platform_contribution
          : row0.max_platform_contribution != null
            ? parseFloat(row0.max_platform_contribution)
            : null,
      max_merchant_contribution:
        parsed.data.max_merchant_contribution !== undefined
          ? parsed.data.max_merchant_contribution
          : row0.max_merchant_contribution != null
            ? parseFloat(row0.max_merchant_contribution)
            : null,
      target_scope: parsed.data.target_scope ?? row0.target_scope,
      geo_level: parsed.data.geo_level !== undefined ? parsed.data.geo_level : row0.geo_level,
      geo_ids: parsed.data.geo_ids ?? (Array.isArray(row0.geo_ids) ? row0.geo_ids : []),
      merchant_ids: parsed.data.merchant_ids ?? (Array.isArray(row0.merchant_ids) ? row0.merchant_ids : []),
      customer_segment: parsed.data.customer_segment ?? row0.customer_segment,
      min_order_amount:
        parsed.data.min_order_amount !== undefined
          ? parsed.data.min_order_amount
          : row0.min_order_amount != null
            ? parseFloat(row0.min_order_amount)
            : null,
      max_discount_amount:
        parsed.data.max_discount_amount !== undefined
          ? parsed.data.max_discount_amount
          : row0.max_discount_amount != null
            ? parseFloat(row0.max_discount_amount)
            : null,
      buy_qty: parsed.data.buy_qty !== undefined ? parsed.data.buy_qty : row0.buy_qty,
      get_qty: parsed.data.get_qty !== undefined ? parsed.data.get_qty : row0.get_qty,
      is_stackable: parsed.data.is_stackable ?? row0.is_stackable,
      exclusion_group: parsed.data.exclusion_group !== undefined ? parsed.data.exclusion_group : row0.exclusion_group,
      starts_at: parsed.data.starts_at !== undefined ? parsed.data.starts_at : row0.starts_at,
      ends_at: parsed.data.ends_at !== undefined ? parsed.data.ends_at : row0.ends_at,
      budget_total:
        parsed.data.budget_total !== undefined
          ? parsed.data.budget_total
          : row0.budget_total != null
            ? parseFloat(row0.budget_total)
            : null,
      budget_used:
        parsed.data.budget_used !== undefined
          ? parsed.data.budget_used
          : row0.budget_used != null
            ? parseFloat(row0.budget_used)
            : 0,
      discount_type: parsed.data.discount_type ?? row0.discount_type,
      value_numeric:
        parsed.data.value_numeric !== undefined
          ? parsed.data.value_numeric
          : row0.value_numeric != null
            ? parseFloat(row0.value_numeric)
            : null,
      delivery_discount_type:
        parsed.data.delivery_discount_type !== undefined ? parsed.data.delivery_discount_type : row0.delivery_discount_type,
      delivery_discount_value:
        parsed.data.delivery_discount_value !== undefined
          ? parsed.data.delivery_discount_value
          : row0.delivery_discount_value != null
            ? parseFloat(row0.delivery_discount_value)
            : null,
      priority: parsed.data.priority ?? row0.priority,
      is_active: parsed.data.is_active ?? row0.is_active,
      is_hidden: parsed.data.is_hidden ?? row0.is_hidden,
      conditions: cond,
      metadata: parsed.data.metadata !== undefined ? parsed.data.metadata : row0.metadata,
    };
    const patchKindErr = validatePlatformOfferKindFieldsForApi({
      offer_kind: merged.offer_kind,
      buy_qty: merged.buy_qty,
      get_qty: merged.get_qty,
      conditions: merged.conditions as Record<string, unknown>,
      discount_type: merged.discount_type,
      value_numeric: merged.value_numeric,
      delivery_discount_type: merged.delivery_discount_type,
    });
    if (patchKindErr) {
      return NextResponse.json({ error: patchKindErr }, { status: 400 });
    }
    const offer = await updatePlatformOffer(id, merged);
    if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ offer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const ok = await deletePlatformOffer(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

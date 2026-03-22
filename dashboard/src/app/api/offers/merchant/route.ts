/**
 * Merchant Offers API
 * GET - List offers with search, filters, pagination
 * POST - Create new offer
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

const offerTypeEnum = z.enum([
  "PERCENTAGE_DISCOUNT",
  "FLAT_DISCOUNT",
  "COUPON_DISCOUNT",
  "BUY_N_GET_M",
  "FREE_ITEM",
  "FREE_DELIVERY",
  "COMBO_OFFER",
  "CASHBACK",
  "FIRST_ORDER_OFFER",
  "LOYALTY_BASED",
]);

const createOfferSchema = z.object({
  title: z.string().min(1),
  type: offerTypeEnum,
  storeId: z.number().int().positive(),
  priority: z.number().int().min(1).max(1000).default(100),
  stackable: z.boolean().default(false),
  combinableWith: z.array(z.string()).optional(),
  maxOffersPerOrder: z.number().int().min(1).max(5).default(2),
  validFrom: z.string().datetime(),
  validTill: z.string().datetime(),
  conditions: z.record(z.string(), z.any()).default({}),
  benefits: z.record(z.string(), z.any()),
  usageLimitTotal: z.number().int().positive().nullable().optional(),
  usageLimitPerUser: z.number().int().positive().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

function toMerchantOfferRow(row: Record<string, unknown>) {
  const id = Number(row.id);
  return {
    id,
    title: String(row.title ?? row.offer_title ?? ""),
    offerCode: String(row.offer_id ?? id),
    discountType: (row.type as string) === "PERCENTAGE_DISCOUNT" ? "PERCENTAGE" : "FLAT",
    discountValue: Number((row.benefits as any)?.percentage_value ?? (row.benefits as any)?.flat_amount ?? 0),
    minOrderAmount:
      (row.conditions as any)?.min_order_value != null
        ? Number((row.conditions as any).min_order_value)
        : null,
    validFrom: String(row.valid_from),
    validTill: String(row.valid_till),
    isActive: row.status === "ACTIVE",
    createdAt: String(row.created_at),
    storeId: row.store_id != null ? Number(row.store_id) : null,
    storeName: (row.store_name as string) ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status"); // "active" | "inactive" | ""
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

    const sql = getSql() as { unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]> };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (search) {
      conditions.push(`(o.metadata->>'legacy_offer_code' ILIKE $${p} OR o.id::text ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }
    if (status === "active") {
      conditions.push(`o.status = 'ACTIVE'`);
    } else if (status === "inactive") {
      conditions.push(`o.status <> 'ACTIVE'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countParams = [...params];
    const [countRow] = await sql.unsafe(
      `SELECT COUNT(*)::int AS c FROM offers o ${whereClause}`,
      countParams
    );
    const total = (countRow as { c: number })?.c ?? 0;

    const listParams = [...params, limit, offset];
    const rows = await sql.unsafe(
      `SELECT o.id,
              o.store_id,
              o.type,
              o.conditions,
              o.benefits,
              o.valid_from,
              o.valid_till,
              o.status,
              o.created_at,
              s.store_name
       FROM offers o
       LEFT JOIN merchant_stores s ON s.id = o.store_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      listParams
    );

    const offers = (rows as Record<string, unknown>[]).map(toMerchantOfferRow);

    return NextResponse.json({
      success: true,
      data: { offers, total },
    });
  } catch (error) {
    console.error("[offers/merchant API] GET error:", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) {
      return NextResponse.json({ success: false, error: "Only super admins can create offers" }, { status: 403 });
    }

    const raw = await request.json();
    const parsed = createOfferSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      title,
      type,
      storeId,
      priority,
      stackable,
      combinableWith,
      maxOffersPerOrder,
      validFrom,
      validTill,
      conditions,
      benefits,
      usageLimitTotal,
      usageLimitPerUser,
      status,
    } = parsed.data;

    if (new Date(validFrom) >= new Date(validTill)) {
      return NextResponse.json(
        { success: false, error: "Valid till must be after valid from" },
        { status: 400 }
      );
    }

    if (type === "PERCENTAGE_DISCOUNT") {
      const pct = (benefits as any).percentage_value;
      const cap = (benefits as any).max_discount_cap;
      if (typeof pct !== "number" || pct <= 0 || pct > 100 || typeof cap !== "number" || cap <= 0) {
        return NextResponse.json(
          { success: false, error: "Percentage discounts require percentage_value (0-100] and positive max_discount_cap" },
          { status: 400 }
        );
      }
    }

    if (type === "FLAT_DISCOUNT") {
      const flat = (benefits as any).flat_amount;
      const minOrder = (conditions as any).min_order_value;
      if (typeof flat !== "number" || flat <= 0 || typeof minOrder !== "number" || minOrder <= flat) {
        return NextResponse.json(
          { success: false, error: "Flat discounts require flat_amount > 0 and min_order_value > flat_amount" },
          { status: 400 }
        );
      }
    }

    if (type === "COUPON_DISCOUNT") {
      const code = (benefits as any).coupon_code;
      if (!code || typeof code !== "string") {
        return NextResponse.json(
          { success: false, error: "Coupon discounts require coupon_code" },
          { status: 400 }
        );
      }
    }

    const sql = getSql();
    const [inserted] = await sql`
      INSERT INTO offers (
        store_id,
        type,
        subtype,
        conditions,
        benefits,
        priority,
        stackable,
        combinable_with,
        max_offers_per_order,
        usage_limit_total,
        usage_limit_per_user,
        valid_from,
        valid_till,
        status,
        stacking_policy,
        metadata
      )
      VALUES (
        ${storeId},
        ${type},
        ${null},
        ${JSON.stringify(conditions)}::jsonb,
        ${JSON.stringify(benefits)}::jsonb,
        ${priority},
        ${stackable},
        ${JSON.stringify(combinableWith ?? [])}::text[],
        ${maxOffersPerOrder},
        ${usageLimitTotal ?? null},
        ${usageLimitPerUser ?? null},
        ${new Date(validFrom).toISOString()},
        ${new Date(validTill).toISOString()},
        ${status},
        ${"MERCHANT_CONTROLLED"},
        ${JSON.stringify({})}::jsonb
      )
      RETURNING id, store_id, type, conditions, benefits, valid_from, valid_till, status, created_at
    `;

    const row = inserted as Record<string, unknown>;
    const offer = toMerchantOfferRow({ ...row, store_name: null });

    return NextResponse.json({ success: true, data: offer }, { status: 201 });
  } catch (error: unknown) {
    console.error("[offers/merchant API] POST error:", error);
    const err = error as { code?: string; constraint?: string };
    if (err?.code === "23505" || err?.constraint?.includes("offer_id")) {
      return NextResponse.json(
        { success: false, error: "Offer code already exists" },
        { status: 409 }
      );
    }
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

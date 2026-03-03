/**
 * Merchant Offers API
 * GET - List offers with search, filters, pagination
 * POST - Create new offer
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

function toOfferRow(row: Record<string, unknown>) {
  const id = Number(row.id);
  const discountValue = row.discount_value != null ? Number(row.discount_value) : null;
  const discountPct = row.discount_percentage != null ? Number(row.discount_percentage) : null;
  const isPct = (row.offer_type as string) === "PERCENTAGE" || discountPct != null;
  return {
    id,
    title: row.offer_title as string,
    offerCode: row.offer_id as string,
    discountType: isPct ? "PERCENTAGE" : "FLAT",
    discountValue: isPct ? (discountPct ?? 0) : (discountValue ?? 0),
    minOrderAmount: row.min_order_amount != null ? Number(row.min_order_amount) : null,
    validFrom: row.valid_from as string,
    validTill: row.valid_till as string,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
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
      conditions.push(`(o.offer_title ILIKE $${p} OR o.offer_id ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }
    if (status === "active") {
      conditions.push(`o.is_active = true`);
    } else if (status === "inactive") {
      conditions.push(`o.is_active = false`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countParams = [...params];
    const [countRow] = await sql.unsafe(
      `SELECT COUNT(*)::int AS c FROM merchant_offers o ${whereClause}`,
      countParams
    );
    const total = (countRow as { c: number })?.c ?? 0;

    const listParams = [...params, limit, offset];
    const rows = await sql.unsafe(
      `SELECT o.id, o.offer_id, o.offer_title, o.offer_type, o.discount_value, o.discount_percentage,
        o.min_order_amount, o.valid_from, o.valid_till, o.is_active, o.created_at, o.store_id,
        s.store_name AS store_name
       FROM merchant_offers o
       LEFT JOIN merchant_stores s ON s.id = o.store_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      listParams
    );

    const offers = (rows as Record<string, unknown>[]).map(toOfferRow);

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

    const body = await request.json();
    const {
      title,
      offerCode,
      discountType,
      discountValue,
      minOrderAmount,
      validFrom,
      validTill,
      isActive = true,
      storeId,
    } = body;

    if (!title || !offerCode || !discountType || discountValue == null || !validFrom || !validTill) {
      return NextResponse.json(
        { success: false, error: "Title, offer code, discount type, discount value, valid from, and valid till are required" },
        { status: 400 }
      );
    }

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "Store is required" },
        { status: 400 }
      );
    }

    if (new Date(validFrom) >= new Date(validTill)) {
      return NextResponse.json(
        { success: false, error: "Valid till must be after valid from" },
        { status: 400 }
      );
    }

    const offerType = discountType === "PERCENTAGE" ? "PERCENTAGE" : "FLAT";
    const discountValueNum = Number(discountValue);
    const minOrder = minOrderAmount != null ? Number(minOrderAmount) : null;

    const sql = getSql();

    // Generate unique offer_id if not provided as code (offer_id is the code)
    const code = String(offerCode).trim().toUpperCase().replace(/\s+/g, "_");

    const [inserted] = await sql`
      INSERT INTO merchant_offers (
        offer_id, offer_title, store_id, offer_type,
        discount_value, discount_percentage,
        min_order_amount, valid_from, valid_till, is_active
      )
      VALUES (
        ${code},
        ${String(title).trim()},
        ${storeId != null ? Number(storeId) : null},
        ${offerType},
        ${offerType === "FLAT" ? discountValueNum : null},
        ${offerType === "PERCENTAGE" ? discountValueNum : null},
        ${minOrder},
        ${new Date(validFrom).toISOString()},
        ${new Date(validTill).toISOString()},
        ${Boolean(isActive)}
      )
      RETURNING id, offer_id, offer_title, offer_type, discount_value, discount_percentage,
        min_order_amount, valid_from, valid_till, is_active, created_at, store_id
    `;

    const row = inserted as Record<string, unknown>;
    const offer = toOfferRow({ ...row, store_name: null });

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

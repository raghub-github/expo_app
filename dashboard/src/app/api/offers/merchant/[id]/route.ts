/**
 * Merchant Offer by ID
 * GET - Fetch single offer
 * PUT - Update offer
 * PATCH - Toggle is_active
 * DELETE - Soft delete (set is_active = false)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

function toOfferRow(row: Record<string, unknown>) {
  const discountValue = row.discount_value != null ? Number(row.discount_value) : null;
  const discountPct = row.discount_percentage != null ? Number(row.discount_percentage) : null;
  const isPct = (row.offer_type as string) === "PERCENTAGE" || discountPct != null;
  return {
    id: Number(row.id),
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "Invalid offer ID" }, { status: 400 });
    }

    const sql = getSql();
    const [row] = await sql`
      SELECT o.id, o.offer_id, o.offer_title, o.offer_type, o.discount_value, o.discount_percentage,
        o.min_order_amount, o.valid_from, o.valid_till, o.is_active, o.created_at, o.store_id,
        s.store_name AS store_name
      FROM merchant_offers o
      LEFT JOIN merchant_stores s ON s.id = o.store_id
      WHERE o.id = ${id}
    `;

    if (!row) {
      return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });
    }

    const offer = toOfferRow(row as Record<string, unknown>);
    return NextResponse.json({ success: true, data: offer });
  } catch (error) {
    console.error("[offers/merchant/[id] API] GET error:", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) {
      return NextResponse.json({ success: false, error: "Only super admins can update offers" }, { status: 403 });
    }

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "Invalid offer ID" }, { status: 400 });
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
      isActive,
      storeId,
    } = body;

    if (validFrom != null && validTill != null && new Date(validFrom) >= new Date(validTill)) {
      return NextResponse.json(
        { success: false, error: "Valid till must be after valid from" },
        { status: 400 }
      );
    }

    const sql = getSql();

    const updates: string[] = [];
    /** Bound parameters for `sql.unsafe` (must not be `unknown[]` for postgres.js typings). */
    const values: (string | number | boolean | null)[] = [];
    let p = 1;

    if (title !== undefined) {
      updates.push(`offer_title = $${p++}`);
      values.push(String(title).trim());
    }
    if (offerCode !== undefined) {
      updates.push(`offer_id = $${p++}`);
      values.push(String(offerCode).trim().toUpperCase().replace(/\s+/g, "_"));
    }
    if (discountType !== undefined) {
      const ot = discountType === "PERCENTAGE" ? "PERCENTAGE" : "FLAT";
      updates.push(`offer_type = $${p++}`);
      values.push(ot);
    }
    if (discountValue !== undefined) {
      const v = Number(discountValue);
      updates.push(`discount_value = $${p++}`);
      values.push(discountType === "PERCENTAGE" ? null : v);
      updates.push(`discount_percentage = $${p++}`);
      values.push(discountType === "PERCENTAGE" ? v : null);
    }
    if (minOrderAmount !== undefined) {
      updates.push(`min_order_amount = $${p++}`);
      values.push(minOrderAmount == null ? null : Number(minOrderAmount));
    }
    if (validFrom !== undefined) {
      updates.push(`valid_from = $${p++}`);
      values.push(new Date(validFrom).toISOString());
    }
    if (validTill !== undefined) {
      updates.push(`valid_till = $${p++}`);
      values.push(new Date(validTill).toISOString());
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${p++}`);
      values.push(Boolean(isActive));
    }
    if (storeId !== undefined) {
      updates.push(`store_id = $${p++}`);
      values.push(storeId == null ? null : Number(storeId));
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    const setClause = updates.join(", ");
    const [updated] = await sql.unsafe(
      `UPDATE merchant_offers SET ${setClause}, updated_at = NOW()
       WHERE id = $${p} RETURNING id, offer_id, offer_title, offer_type, discount_value, discount_percentage,
         min_order_amount, valid_from, valid_till, is_active, created_at, store_id`,
      values as never[]
    );

    if (!updated) {
      return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });
    }

    const offer = toOfferRow({ ...(updated as Record<string, unknown>), store_name: null });
    return NextResponse.json({ success: true, data: offer });
  } catch (error: unknown) {
    console.error("[offers/merchant/[id] API] PUT error:", error);
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) {
      return NextResponse.json({ success: false, error: "Only super admins can update offers" }, { status: 403 });
    }

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "Invalid offer ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const isActive = body.isActive;

    if (typeof isActive !== "boolean") {
      return NextResponse.json({ success: false, error: "isActive (boolean) required" }, { status: 400 });
    }

    const sql = getSql();
    const [updated] = await sql`
      UPDATE merchant_offers SET is_active = ${isActive}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, offer_id, offer_title, offer_type, discount_value, discount_percentage,
        min_order_amount, valid_from, valid_till, is_active, created_at, store_id
    `;

    if (!updated) {
      return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });
    }

    const offer = toOfferRow({ ...(updated as Record<string, unknown>), store_name: null });
    return NextResponse.json({ success: true, data: offer });
  } catch (error) {
    console.error("[offers/merchant/[id] API] PATCH error:", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) {
      return NextResponse.json({ success: false, error: "Only super admins can delete offers" }, { status: 403 });
    }

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "Invalid offer ID" }, { status: 400 });
    }

    const sql = getSql();
    // Soft delete: set is_active = false
    const [updated] = await sql`
      UPDATE merchant_offers SET is_active = false, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id
    `;

    if (!updated) {
      return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { message: "Offer deleted successfully", id: (updated as { id: number }).id },
    });
  } catch (error) {
    console.error("[offers/merchant/[id] API] DELETE error:", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

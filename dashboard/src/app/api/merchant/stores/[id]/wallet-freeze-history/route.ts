import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const storeId = parseInt((await params).id, 10);
  if (!Number.isFinite(storeId)) {
    return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const superAdmin = await isSuperAdmin(user.id, user.email);
  const allowed =
    superAdmin || (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Merchant dashboard access required" },
      { status: 403 },
    );
  }

  const areaManagerId = await resolveMerchantListAreaManagerId({
    supabaseAuthId: user.id,
    email: user.email,
  });
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
  }

  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 20;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT
        l.id,
        l.previous_status,
        l.new_status,
        l.reason,
        l.created_at,
        su.email AS performed_by_email,
        su.full_name AS performed_by_name
      FROM payment_wallet_freeze_logs l
      JOIN merchant_wallet w ON w.id = l.wallet_id
      LEFT JOIN system_users su ON su.id = l.frozen_by_system_user_id
      WHERE w.merchant_store_id = ${storeId}
      ORDER BY l.created_at DESC
      LIMIT ${limit}
    `;

    const history = rows.map((row) => {
      const r = row as {
        id: number;
        previous_status?: string | null;
        new_status?: string;
        reason?: string | null;
        created_at: Date | string;
        performed_by_email?: string | null;
        performed_by_name?: string | null;
      };
      const newStatus = String(r.new_status ?? "").toUpperCase();
      return {
        id: Number(r.id),
        action: newStatus === "FROZEN" ? "freeze" : "unfreeze",
        previousState: r.previous_status ?? null,
        newState: r.new_status ?? null,
        reason: r.reason ?? null,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        performedByEmail: r.performed_by_email ?? null,
        performedByName: r.performed_by_name ?? null,
      };
    });

    return NextResponse.json({ success: true, data: { history } });
  } catch (err) {
    console.error("[GET /api/merchant/stores/[id]/wallet-freeze-history]", err);
    return NextResponse.json({ success: true, data: { history: [] } });
  }
}

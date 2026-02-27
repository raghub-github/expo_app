/**
 * POST /api/merchant/stores/[id]/tickets/[ticketId]/reopen
 * Set ticket status to REOPENED (or OPEN), clear resolution, set reopened_at.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; ticketId: string }> }
) {
  try {
    const { id, ticketId: ticketIdParam } = await params;
    const storeId = parseInt(id, 10);
    const ticketId = parseInt(ticketIdParam, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(ticketId)) {
      return NextResponse.json({ success: false, error: "Invalid id or ticketId" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const sqlClient = getSql();
    const ticketCheck = await sqlClient`
      SELECT id, status FROM public.unified_tickets WHERE id = ${ticketId} AND merchant_store_id = ${storeId} LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    try {
      await sqlClient`
        UPDATE public.unified_tickets
        SET status = 'REOPENED', resolution = NULL, resolved_at = NULL, resolved_by = NULL, resolved_by_name = NULL,
            reopened_at = NOW(), updated_at = NOW()
        WHERE id = ${ticketId} AND merchant_store_id = ${storeId}
      `;
    } catch (colErr) {
      await sqlClient`
        UPDATE public.unified_tickets
        SET status = 'REOPENED', resolution = NULL, resolved_at = NULL, resolved_by = NULL, resolved_by_name = NULL,
            updated_at = NOW()
        WHERE id = ${ticketId} AND merchant_store_id = ${storeId}
      `;
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/tickets/[ticketId]/reopen]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

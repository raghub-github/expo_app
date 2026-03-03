/**
 * GET /api/merchant/stores/[id]/ledger
 * Query: limit, offset, from, to, direction, category, search
 * Returns { success, entries: LedgerEntry[], total }.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const direction = searchParams.get("direction") as "CREDIT" | "DEBIT" | null | undefined;
    const category = searchParams.get("category") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    // TODO: query merchant_ledger / wallet_ledger when wired; for now return stub
    const entries: Array<{
      id: number;
      direction: "CREDIT" | "DEBIT";
      category: string;
      balance_type: string;
      amount: number;
      balance_after: number;
      reference_type: string;
      reference_id: number | null;
      reference_extra: string | null;
      description: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
      order_id: number | null;
      formatted_order_id: string | null;
      table_id: string | null;
    }> = [];
    const total = 0;

    return NextResponse.json({ success: true, entries, total });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/ledger]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

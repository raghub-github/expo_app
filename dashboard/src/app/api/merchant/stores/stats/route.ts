/**
 * GET /api/merchant/stores/stats
 * Returns counts of merchant_stores by category (total, verified, pending, rejected, new).
 * Scoped by area manager for non–super-admin users.
 * Query: fromDate, toDate (YYYY-MM-DD) — when set, counts are filtered by created_at range.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { countMerchantStoresByStatus, countMerchantParents } from "@/lib/db/operations/merchant-stores";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }
    const { user } = auth;

    if (!user.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant dashboard access required",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });

    const fromDate = request.nextUrl.searchParams.get("fromDate")?.trim() || undefined;
    const toDate = request.nextUrl.searchParams.get("toDate")?.trim() || undefined;
    const storeType = request.nextUrl.searchParams.get("storeType")?.trim() || undefined;
    const stats = await countMerchantStoresByStatus(areaManagerId, {
      createdFrom: fromDate,
      createdTo: toDate,
      storeType: storeType && storeType !== "" ? storeType : undefined,
    });
    const partners = await countMerchantParents(areaManagerId);
    return NextResponse.json({ success: true, ...stats, partners });
  } catch (e) {
    console.error("[GET /api/merchant/stores/stats]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

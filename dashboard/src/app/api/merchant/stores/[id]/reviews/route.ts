/**
 * GET /api/merchant/stores/[id]/reviews
 * Returns { success, reviews, stats } for User Insights from merchant_store_ratings.
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getRatingsByStoreId } from "@/lib/db/operations/merchant-store-ratings";

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
  _request: Request,
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

    const rows = await getRatingsByStoreId(storeId, 200);
    const reviews = rows.map((r) => {
      const message = [r.review_title, r.review_text].filter(Boolean).join("\n") || "—";
      return {
        id: r.id,
        customerId: r.customer_id ?? 0,
        customerName: r.customer_id != null ? `Customer #${r.customer_id}` : "Customer",
        customerEmail: null as string | null,
        customerMobile: null as string | null,
        orderId: r.order_id,
        date: r.created_at,
        type: "Review" as const,
        message,
        response: r.merchant_response ?? "",
        respondedAt: r.merchant_responded_at,
        userType: "new" as const,
        rating: r.rating,
        foodQualityRating: r.food_rating,
        deliveryRating: r.service_rating,
        packagingRating: r.packaging_rating,
        reviewImages: Array.isArray(r.review_images) ? r.review_images : [],
        reviewTags: [],
        orderCount: 0,
        isVerified: r.is_verified ?? false,
        isFlagged: r.is_flagged ?? false,
        flagReason: r.flag_reason,
      };
    });

    const stats = {
      total: reviews.length,
      reviews: reviews.length,
      complaints: 0,
      repeatedUsers: 0,
      newUsers: reviews.length,
      fraudUsers: reviews.filter((r) => r.isFlagged).length,
    };

    return NextResponse.json({ success: true, reviews, stats });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/reviews]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

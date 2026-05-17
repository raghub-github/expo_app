import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import {
  resolveOrderMetaByRatingOrderIds,
  type RatingOrderMeta,
} from "@/lib/resolve-order-meta-for-ratings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type RatingRow = {
  id: number;
  store_id: number;
  order_id: number | null;
  customer_id: number | null;
  rating: number;
  food_rating: number | null;
  service_rating: number | null;
  packaging_rating: number | null;
  review_text: string | null;
  review_title: string | null;
  review_images: string[] | null;
  merchant_response: string | null;
  merchant_responded_at: string | null;
  is_verified: boolean | null;
  is_flagged: boolean | null;
  flag_reason: string | null;
  created_at: string;
};

function orderSummaryFromOrderMeta(o: RatingOrderMeta | undefined): string | null {
  if (!o) return null;
  const orderType = (o.order_type || "").toString().trim().toLowerCase();
  const typeLabel =
    orderType === "food" ? "Food order" : orderType ? `${orderType} order` : "Order";

  // Try to infer a human-friendly item label from items JSON.
  let itemLabel: string | null = null;
  const items = o.items as any;
  if (Array.isArray(items) && items.length > 0) {
    const first = items[0] ?? {};
    const name =
      (typeof first.name === "string" && first.name.trim()) ||
      (typeof first.item_name === "string" && first.item_name.trim()) ||
      (typeof first.title === "string" && first.title.trim()) ||
      null;
    if (name) {
      const more = items.length > 1 ? ` +${items.length - 1} more` : "";
      itemLabel = `${name}${more}`;
    }
  }

  if (itemLabel) return `${typeLabel} · ${itemLabel}`;
  return typeLabel;
}

/**
 * GET /api/merchant/reviews?storeId=GMMC…&from=&to=
 * Same data as the merchant app: `merchant_store_ratings` for the store (numeric internal id resolved via assertStoreAccess).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId")?.trim() || "";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    if (!storeId) {
      return NextResponse.json({ success: false, error: "Store ID is required." }, { status: 400 });
    }

    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
    }
    const storeInternalId = gate.storeIdNum;

    const from =
      fromParam && !Number.isNaN(Date.parse(fromParam)) ? new Date(fromParam) : null;
    const to = toParam && !Number.isNaN(Date.parse(toParam)) ? new Date(toParam) : null;

    const db = getSupabaseAdmin();

    const { data: rows, error } = await db
      .from("merchant_store_ratings")
      .select(
        "id, store_id, order_id, customer_id, rating, food_rating, service_rating, packaging_rating, review_text, review_title, review_images, merchant_response, merchant_responded_at, is_verified, is_flagged, flag_reason, created_at"
      )
      .eq("store_id", storeInternalId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[merchant/reviews] merchant_store_ratings:", error);
      return NextResponse.json({ success: false, error: "Failed to fetch reviews." }, { status: 500 });
    }

    const list = (rows ?? []) as RatingRow[];

    const filtered = list.filter((r) => {
      const created = new Date(r.created_at);
      if (Number.isNaN(created.getTime())) return false;
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });

    const customerIds = [...new Set(filtered.map((r) => r.customer_id).filter((id): id is number => typeof id === "number" && id > 0))];
    const orderIds = [
      ...new Set(
        filtered
          .map((r) => r.order_id)
          .filter((id): id is number => typeof id === "number" && id > 0)
      ),
    ];

    const customerById: Record<number, { name: string | null; mobile: string | null; email: string | null }> = {};
    if (customerIds.length > 0) {
      // Customers schema uses `full_name` + `primary_mobile` (see backend drizzle customers migrations).
      const { data: custRows } = await db
        .from("customers")
        .select("id, full_name, primary_mobile, email")
        .in("id", customerIds);
      for (const c of custRows ?? []) {
        const id = (c as { id?: number }).id;
        if (typeof id === "number") {
          customerById[id] = {
            name: (c as { full_name?: string | null }).full_name ?? null,
            mobile: (c as { primary_mobile?: string | null }).primary_mobile ?? null,
            email: (c as { email?: string | null }).email ?? null,
          };
        }
      }
    }

    const orderCounts: Record<number, number> = {};
    if (customerIds.length > 0) {
      const { data: orderData } = await db
        .from("orders_food")
        .select("customer_id")
        .in("customer_id", customerIds)
        .eq("merchant_store_id", storeInternalId);
      for (const order of orderData ?? []) {
        const cid = (order as { customer_id?: number | null }).customer_id;
        if (typeof cid === "number") {
          orderCounts[cid] = (orderCounts[cid] || 0) + 1;
        }
      }
    }

    const orderMetaByRatingOrderId = await resolveOrderMetaByRatingOrderIds(
      db,
      orderIds,
    );

    const formattedReviews = filtered.map((review) => {
      const customer = review.customer_id != null ? customerById[review.customer_id] : undefined;
      const orderMeta =
        review.order_id != null
          ? orderMetaByRatingOrderId.get(review.order_id)
          : undefined;
      const orderCount = review.customer_id != null ? orderCounts[review.customer_id] || 0 : 0;
      let userType: "new" | "repeated" | "fraud" = "new";
      if (review.is_flagged === true) userType = "fraud";
      else if (orderCount >= 5) userType = "repeated";

      const type = review.rating >= 4 ? "Review" : "Complaint";
      const imgs = Array.isArray(review.review_images) ? review.review_images : [];

      return {
        id: review.id,
        customerId: review.customer_id ?? 0,
        customerName: customer?.name || "Anonymous",
        customerEmail: customer?.email ?? null,
        customerMobile: customer?.mobile ?? null,
        orderId: orderMeta?.coreId ?? review.order_id,
        orderPublicId: orderMeta?.orderPublicId ?? null,
        orderSummary: orderSummaryFromOrderMeta(orderMeta),
        date: review.created_at,
        type,
        message: review.review_text || review.review_title || "",
        response: review.merchant_response || "",
        respondedAt: review.merchant_responded_at,
        userType,
        rating: review.rating,
        foodQualityRating: review.food_rating,
        deliveryRating: review.service_rating,
        packagingRating: review.packaging_rating,
        reviewImages: imgs,
        reviewTags: [] as string[],
        orderCount,
        isVerified: review.is_verified === true,
        isFlagged: review.is_flagged === true,
        flagReason: review.flag_reason ?? null,
      };
    });

    const stats = {
      total: formattedReviews.length,
      reviews: formattedReviews.filter((r) => r.type === "Review").length,
      complaints: formattedReviews.filter((r) => r.type === "Complaint").length,
      repeatedUsers: formattedReviews.filter((r) => r.userType === "repeated").length,
      newUsers: formattedReviews.filter((r) => r.userType === "new").length,
      fraudUsers: formattedReviews.filter((r) => r.userType === "fraud").length,
    };

    return NextResponse.json({
      success: true,
      reviews: formattedReviews,
      stats,
    });
  } catch (e) {
    console.error("[merchant/reviews] Error:", e);
    return NextResponse.json({ success: false, error: "An error occurred. Please try again." }, { status: 500 });
  }
}

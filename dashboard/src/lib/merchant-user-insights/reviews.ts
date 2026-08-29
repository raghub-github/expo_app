/**
 * User Insights reviews — same tables as partnersite:
 * merchant_store_ratings, customers, orders_food, orders_core
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveOrderMetaByRatingOrderIds } from "./resolve-order-meta";
import type { UserInsightReview, UserInsightReviewStats } from "./types";
import {
  parseMerchantReviewReplies,
  encodeLegacyMerchantResponse,
  appendMerchantReviewReply,
} from "@/lib/merchant-review-replies";

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
  merchant_responses?: unknown;
  merchant_responded_at: string | null;
  is_verified: boolean | null;
  is_flagged: boolean | null;
  flag_reason: string | null;
  created_at: string;
};

type OrdersCoreRow = {
  order_type?: string | null;
  items?: unknown;
};

function orderSummaryFromOrdersCore(o: OrdersCoreRow | undefined): string | null {
  if (!o) return null;
  const orderType = (o.order_type || "").toString().trim().toLowerCase();
  const typeLabel =
    orderType === "food" ? "Food order" : orderType ? `${orderType} order` : "Order";

  let itemLabel: string | null = null;
  const items = o.items;
  if (Array.isArray(items) && items.length > 0) {
    const first = items[0] as Record<string, unknown>;
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

function buildStats(reviews: UserInsightReview[]): UserInsightReviewStats {
  return {
    total: reviews.length,
    reviews: reviews.filter((r) => r.type === "Review").length,
    complaints: reviews.filter((r) => r.type === "Complaint").length,
    repeatedUsers: reviews.filter((r) => r.userType === "repeated").length,
    newUsers: reviews.filter((r) => r.userType === "new").length,
    fraudUsers: reviews.filter((r) => r.userType === "fraud").length,
  };
}

export async function fetchUserInsightReviews(
  storeInternalId: number,
  from: Date | null,
  to: Date | null,
): Promise<{ reviews: UserInsightReview[]; stats: UserInsightReviewStats }> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  const db = supabaseAdmin;

  const { data: rows, error } = await db
    .from("merchant_store_ratings")
    .select(
      "id, store_id, order_id, customer_id, rating, food_rating, service_rating, packaging_rating, review_text, review_title, review_images, merchant_response, merchant_responses, merchant_responded_at, is_verified, is_flagged, flag_reason, created_at",
    )
    .eq("store_id", storeInternalId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[merchant-user-insights/reviews] merchant_store_ratings:", error);
    throw new Error("Failed to fetch reviews.");
  }

  const list = (rows ?? []) as RatingRow[];

  const filtered = list.filter((r) => {
    const created = new Date(r.created_at);
    if (Number.isNaN(created.getTime())) return false;
    if (from && created < from) return false;
    if (to && created > to) return false;
    return true;
  });

  const customerIds = [
    ...new Set(
      filtered
        .map((r) => r.customer_id)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ];
  const orderIds = [
    ...new Set(
      filtered
        .map((r) => r.order_id)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ];

  const customerById: Record<
    number,
    { name: string | null; mobile: string | null; email: string | null }
  > = {};

  if (customerIds.length > 0) {
    const { data: custRows } = await db
      .from("customers")
      .select("id, full_name, primary_mobile, email")
      .in("id", customerIds);

    for (const c of custRows ?? []) {
      const row = c as {
        id?: number;
        full_name?: string | null;
        primary_mobile?: string | null;
        email?: string | null;
      };
      if (typeof row.id === "number") {
        customerById[row.id] = {
          name: row.full_name?.trim() || null,
          mobile: row.primary_mobile?.trim() || null,
          email: row.email?.trim() || null,
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

  const reviews: UserInsightReview[] = filtered.map((review) => {
    const customer =
      review.customer_id != null ? customerById[review.customer_id] : undefined;
    const orderMeta =
      review.order_id != null
        ? orderMetaByRatingOrderId.get(review.order_id)
        : undefined;
    const orderCount =
      review.customer_id != null ? orderCounts[review.customer_id] || 0 : 0;

    let userType: "new" | "repeated" | "fraud" = "new";
    if (review.is_flagged === true) userType = "fraud";
    else if (orderCount >= 5) userType = "repeated";

    const type = review.rating >= 4 ? "Review" : "Complaint";
    const imgs = Array.isArray(review.review_images) ? review.review_images : [];

    const replies = parseMerchantReviewReplies(
      review.merchant_responses,
      review.merchant_response,
      review.merchant_responded_at,
    );
    const last = replies[replies.length - 1];

    return {
      id: review.id,
      customerId: review.customer_id ?? 0,
      customerName: customer?.name || "Anonymous",
      customerEmail: customer?.email ?? null,
      customerMobile: customer?.mobile ?? null,
      orderId: orderMeta?.coreId ?? review.order_id,
      orderPublicId: orderMeta?.orderPublicId ?? null,
      orderSummary: orderSummaryFromOrdersCore(orderMeta),
      date: review.created_at,
      type,
      message: review.review_text || review.review_title || "",
      response: last ? encodeLegacyMerchantResponse(last.text, last.images) : review.merchant_response || "",
      replies,
      respondedAt: last?.at ?? review.merchant_responded_at,
      userType,
      rating: review.rating,
      foodQualityRating: review.food_rating,
      deliveryRating: review.service_rating,
      packagingRating: review.packaging_rating,
      reviewImages: imgs,
      reviewTags: [],
      orderCount,
      isVerified: review.is_verified === true,
      isFlagged: review.is_flagged === true,
      flagReason: review.flag_reason ?? null,
    };
  });

  return { reviews, stats: buildStats(reviews) };
}

export async function respondToUserInsightReview(
  storeInternalId: number,
  reviewId: number,
  message: string | undefined,
  images: string[] | undefined,
): Promise<{ review: Record<string, unknown> }> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  const db = supabaseAdmin;

  const { data: ratingRow, error: ratingErr } = await db
    .from("merchant_store_ratings")
    .select("id, store_id, merchant_response, merchant_responses, merchant_responded_at")
    .eq("id", reviewId)
    .maybeSingle();

  if (ratingErr || !ratingRow) {
    throw new Error("REVIEW_NOT_FOUND");
  }

  if (Number(ratingRow.store_id) !== storeInternalId) {
    throw new Error("FORBIDDEN");
  }

  const imagesList = images ?? [];
  const responseText = encodeLegacyMerchantResponse(message?.trim() || "", imagesList);
  const nowIso = new Date().toISOString();
  const nextReplies = appendMerchantReviewReply(
    (ratingRow as { merchant_responses?: unknown }).merchant_responses,
    (ratingRow as { merchant_response?: string | null }).merchant_response,
    (ratingRow as { merchant_responded_at?: string | null }).merchant_responded_at,
    {
      text: message?.trim() || "",
      at: nowIso,
      ...(imagesList.length > 0 ? { images: imagesList } : {}),
    },
  );

  const { data: updatedReview, error: updateError } = await db
    .from("merchant_store_ratings")
    .update({
      merchant_response: responseText,
      merchant_responses: nextReplies,
      merchant_responded_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", reviewId)
    .eq("store_id", storeInternalId)
    .select()
    .single();

  if (updateError) {
    console.error("[merchant-user-insights/reviews] respond:", updateError);
    throw new Error("Failed to save response.");
  }

  return { review: updatedReview as Record<string, unknown> };
}

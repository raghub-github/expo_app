import { getConfig } from "@/config/env";
import { parseMerchantReviewReplies, type MerchantReviewReply } from "@/lib/merchantReviewReplies";

export type StoreReview = {
  id: number;
  orderId?: number | null;
  foodOrderId?: number | null;
  overallRating: number;
  reviewTitle: string | null;
  reviewText: string | null;
  createdAt: string;
  replyText?: string | null;
  repliedAt?: string | null;
  replies?: MerchantReviewReply[];
  customerName?: string | null;
  customerAvatarUrl?: string | null;
  formattedOrderId?: string | null;
  orderCount?: number | null;
  reviewImages?: string[] | null;
};

function coerceReview(row: StoreReview): StoreReview {
  const id = Number(row.id);
  const replies = parseMerchantReviewReplies(
    row.replies,
    row.replyText,
    row.repliedAt ?? row.createdAt,
  );
  const last = replies[replies.length - 1];
  return {
    ...row,
    id: Number.isFinite(id) ? id : row.id,
    orderId: row.orderId != null && Number.isFinite(Number(row.orderId)) ? Number(row.orderId) : null,
    foodOrderId:
      row.foodOrderId != null && Number.isFinite(Number(row.foodOrderId))
        ? Number(row.foodOrderId)
        : null,
    overallRating: Number(row.overallRating) || 0,
    orderCount:
      row.orderCount != null && Number.isFinite(Number(row.orderCount))
        ? Number(row.orderCount)
        : null,
    reviewImages: Array.isArray(row.reviewImages)
      ? row.reviewImages.map((u) => String(u).trim()).filter(Boolean)
      : [],
    customerAvatarUrl:
      typeof row.customerAvatarUrl === "string" && row.customerAvatarUrl.trim()
        ? row.customerAvatarUrl.trim()
        : null,
    replies,
    replyText: last?.text ?? (typeof row.replyText === "string" ? row.replyText.trim() || null : null),
    repliedAt: last?.at ?? row.repliedAt ?? null,
  };
}

export async function fetchStoreReviews(params: {
  token: string;
  storeId: number;
  from?: string;
  to?: string;
  orderId?: number;
  reviewId?: number;
}) {
  const { apiBaseUrl } = getConfig();
  const url = new URL(
    `${apiBaseUrl}/v1/merchant-partner/stores/${params.storeId}/ratings/reviews`
  );
  if (params.from) url.searchParams.set("from", params.from);
  if (params.to) url.searchParams.set("to", params.to);
  if (params.orderId != null && Number.isFinite(params.orderId) && params.orderId > 0) {
    url.searchParams.set("orderId", String(params.orderId));
  }
  if (params.reviewId != null && Number.isFinite(params.reviewId) && params.reviewId > 0) {
    url.searchParams.set("reviewId", String(params.reviewId));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to load reviews (${res.status})`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Failed to read reviews from server. Please try again.");
  }
  const parsed = data as { success?: boolean; data?: StoreReview[] };
  return {
    success: parsed.success === true,
    data: (parsed.data ?? []).map(coerceReview),
  };
}

export type StoreComplaint = {
  id: number;
  source: "rating" | "ticket";
  overallRating: number;
  reviewTitle: string | null;
  reviewText: string | null;
  replyText: string | null;
  repliedAt: string | null;
  replies?: MerchantReviewReply[];
  createdAt: string;
  isFlagged: boolean;
  orderId?: number | null;
  foodOrderId?: number | null;
  formattedOrderId?: string | null;
  ticketPublicId?: string | null;
  ticketStatus?: string | null;
  reviewImages?: string[] | null;
  customerName?: string | null;
  customerAvatarUrl?: string | null;
  orderCount?: number | null;
};

export async function fetchStoreComplaints(params: {
  token: string;
  storeId: number;
}) {
  const { apiBaseUrl } = getConfig();
  const res = await fetch(
    `${apiBaseUrl}/v1/merchant-partner/stores/${params.storeId}/ratings/complaints`,
    {
      headers: {
        Authorization: `Bearer ${params.token}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to load complaints (${res.status})`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Failed to read complaints from server. Please try again.");
  }
  const parsed = data as { success?: boolean; data?: StoreComplaint[] };
  return {
    success: parsed.success === true,
    data: (parsed.data ?? []).map((row) => {
      const id = Number(row.id);
      const replies = parseMerchantReviewReplies(
        row.replies,
        row.replyText,
        row.repliedAt ?? row.createdAt,
      );
      const last = replies[replies.length - 1];
      return {
        ...row,
        id: Number.isFinite(id) ? id : row.id,
        source: row.source === "ticket" ? ("ticket" as const) : ("rating" as const),
        overallRating: Number(row.overallRating) || 0,
        orderId:
          row.orderId != null && Number.isFinite(Number(row.orderId)) ? Number(row.orderId) : null,
        foodOrderId:
          row.foodOrderId != null && Number.isFinite(Number(row.foodOrderId))
            ? Number(row.foodOrderId)
            : null,
        orderCount:
          row.orderCount != null && Number.isFinite(Number(row.orderCount))
            ? Number(row.orderCount)
            : null,
        reviewImages: Array.isArray(row.reviewImages)
          ? row.reviewImages.map((u) => String(u).trim()).filter(Boolean)
          : [],
        customerAvatarUrl:
          typeof row.customerAvatarUrl === "string" && row.customerAvatarUrl.trim()
            ? row.customerAvatarUrl.trim()
            : null,
        replies,
        replyText: last?.text ?? (typeof row.replyText === "string" ? row.replyText.trim() || null : null),
        repliedAt: last?.at ?? row.repliedAt ?? null,
      };
    }),
  };
}

export async function replyToStoreReview(params: {
  token: string;
  storeId: number;
  reviewId: number;
  replyText: string;
}) {
  const { apiBaseUrl } = getConfig();
  const res = await fetch(
    `${apiBaseUrl}/v1/merchant-partner/stores/${params.storeId}/ratings/reviews/${params.reviewId}/reply`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ replyText: params.replyText }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to save reply (${res.status})`);
  }
  try {
    return (await res.json()) as { success: boolean };
  } catch {
    throw new Error("Reply saved, but server returned an unexpected response.");
  }
}

export async function deleteStoreReviewReply(params: {
  token: string;
  storeId: number;
  reviewId: number;
}) {
  const { apiBaseUrl } = getConfig();
  const res = await fetch(
    `${apiBaseUrl}/v1/merchant-partner/stores/${params.storeId}/ratings/reviews/${params.reviewId}/reply`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${params.token}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to delete reply (${res.status})`);
  }
  try {
    return (await res.json()) as { success: boolean };
  } catch {
    throw new Error("Reply deleted, but server returned an unexpected response.");
  }
}

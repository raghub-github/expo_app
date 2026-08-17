import { getConfig } from "@/config/env";

export async function fetchStoreReviews(params: {
  token: string;
  storeId: number;
  from?: string;
  to?: string;
  orderId?: number;
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
  return data as {
    success: boolean;
    data: Array<{
      id: number;
      orderId?: number | null;
      overallRating: number;
      reviewTitle: string | null;
      reviewText: string | null;
      createdAt: string;
      replyText?: string | null;
      repliedAt?: string | null;
      customerName?: string | null;
      formattedOrderId?: string | null;
    }>;
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


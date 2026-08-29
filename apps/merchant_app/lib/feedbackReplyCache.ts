import { type MerchantReviewReply } from "@/lib/merchantReviewReplies";

export type FeedbackReplySnapshot = {
  id: number;
  overallRating: number;
  reviewTitle: string | null;
  reviewText: string | null;
  createdAt: string;
  replyText?: string | null;
  repliedAt?: string | null;
  replies?: MerchantReviewReply[] | null;
  customerName?: string | null;
  customerAvatarUrl?: string | null;
  formattedOrderId?: string | null;
  orderId?: number | null;
  foodOrderId?: number | null;
  orderCount?: number | null;
  source?: "rating" | "ticket";
  reviewImages?: string[] | null;
};

let snapshot: FeedbackReplySnapshot | null = null;

export function setFeedbackReplySnapshot(item: FeedbackReplySnapshot | null) {
  snapshot = item;
}

export function getFeedbackReplySnapshot(id: number): FeedbackReplySnapshot | null {
  if (!snapshot) return null;
  return Number(snapshot.id) === Number(id) ? snapshot : null;
}

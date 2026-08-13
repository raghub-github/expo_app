export const MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT = "merchant-menu-review-queue-refresh";

export function dispatchMenuReviewQueueRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT));
}

export type MenuReviewPhotoItem = {
  id: number;
  store_id?: number | null;
  store_name?: string | null;
  store_public_id?: string | null;
  item_name: string;
  selling_price: number | null;
  item_image_url: string | null;
  approval_status: string | null;
  primary_image_moderation_status: string | null;
};

export type MenuReviewQueueSummary = {
  pending_change_requests: number;
  pending_photo_reviews: number;
  total_pending: number;
  photo_items?: MenuReviewPhotoItem[];
};

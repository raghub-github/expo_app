export const MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT = "merchant-menu-review-queue-refresh";

export function dispatchMenuReviewQueueRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT));
}

export type MenuReviewQueueSummary = {
  pending_change_requests: number;
  pending_photo_reviews: number;
  total_pending: number;
};

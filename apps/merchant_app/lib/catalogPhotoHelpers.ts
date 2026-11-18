import type { MenuItemRow } from "@/services/menuApi";

/** Prefer pending EDIT photo, then live/catalog URL. */
export function itemDisplayImageUrl(item: MenuItemRow): string | null {
  const pending =
    typeof (item as { pending_review_image_url?: string | null }).pending_review_image_url === "string"
      ? String((item as { pending_review_image_url?: string | null }).pending_review_image_url).trim()
      : "";
  if (pending) return pending;
  const live = typeof item.item_image_url === "string" ? item.item_image_url.trim() : "";
  return live || null;
}

export function itemHasCatalogPhoto(item: MenuItemRow): boolean {
  return Boolean(itemDisplayImageUrl(item)) || (item.image_count ?? 0) > 0;
}

/** True when the primary catalog photo is in moderation PENDING. */
export function itemPhotoInReview(item: MenuItemRow): boolean {
  if (!itemDisplayImageUrl(item)) return false;
  const pendingReview = (item as { pending_review_image_url?: string | null }).pending_review_image_url;
  if (pendingReview) return true;
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  if (primaryMod === "REJECTED") return false;
  if (primaryMod === "PENDING") return true;
  return String(item.approval_status ?? "").toUpperCase() === "PENDING";
}

/** True when the primary photo (or legacy item approval) is rejected. */
export function itemPhotoRejected(item: MenuItemRow): boolean {
  if (!itemDisplayImageUrl(item)) return false;
  const pendingReview = (item as { pending_review_image_url?: string | null }).pending_review_image_url;
  if (pendingReview) return false;
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  if (primaryMod === "REJECTED") return true;
  return String(item.approval_status ?? "").toUpperCase() === "REJECTED";
}

export function itemPrimaryImageRejected(item: MenuItemRow): boolean {
  return String(item.primary_image_moderation_status ?? "").toUpperCase() === "REJECTED";
}

export type MenuApprovalBadgeKind = "image_rejected" | "pending" | "rejected" | "approved";

export type MenuApprovalBadge = {
  kind: MenuApprovalBadgeKind;
  label: string;
  reason: string | null;
};

/**
 * Card badge for Partner Menu / Merchant Catalog.
 * Photo reject keeps approval_status PENDING|APPROVED while primary image is REJECTED —
 * never show "Pending Approval" in that case.
 *
 * Orphaned approval_status=PENDING (no change request / no pending photo) must not show
 * a pending badge when Admin review queues are empty.
 */
export function resolveMenuApprovalBadge(
  item: MenuItemRow,
  opts?: { pendingLabel?: string; showApproved?: boolean },
): MenuApprovalBadge | null {
  const approval = String(item.approval_status ?? "PENDING").toUpperCase();
  const reason = typeof item.rejection_reason === "string" ? item.rejection_reason.trim() || null : null;
  const pendingLabel = opts?.pendingLabel ?? "Pending Approval";
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  const photoPending =
    Boolean((item as { pending_review_image_url?: string | null }).pending_review_image_url) ||
    (Boolean(itemDisplayImageUrl(item)) && primaryMod === "PENDING");
  const changePending = Boolean(
    (item as { has_pending_change_request?: boolean | null }).has_pending_change_request
  );
  const hasRealPendingWork = changePending || photoPending;

  if (itemPrimaryImageRejected(item)) {
    return { kind: "image_rejected", label: "Image rejected", reason };
  }

  if (approval === "REJECTED") {
    return { kind: "rejected", label: "Rejected", reason };
  }

  if (approval === "PENDING" && hasRealPendingWork) {
    return { kind: "pending", label: pendingLabel, reason: null };
  }

  if (approval === "APPROVED" && opts?.showApproved) {
    return { kind: "approved", label: "Approved", reason: null };
  }

  return null;
}

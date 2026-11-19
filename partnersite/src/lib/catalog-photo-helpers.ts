export type CatalogPhotoMenuItem = {
  id: number;
  item_image_url?: string | null;
  pending_review_image_url?: string | null;
  image_count?: number | null;
  approval_status?: string | null;
  primary_image_moderation_status?: string | null;
  rejection_reason?: string | null;
  /** True when a PENDING ADD/EDIT/DELETE review request exists for this item. */
  has_pending_change_request?: boolean | null;
};

/** Prefer pending EDIT photo, then live/catalog URL. */
export function itemDisplayImageUrl(item: CatalogPhotoMenuItem): string | null {
  const pending =
    typeof item.pending_review_image_url === "string"
      ? item.pending_review_image_url.trim()
      : "";
  if (pending) return pending;
  const live = typeof item.item_image_url === "string" ? item.item_image_url.trim() : "";
  return live || null;
}

export function itemHasCatalogPhoto(item: CatalogPhotoMenuItem): boolean {
  return Boolean(itemDisplayImageUrl(item)) || (item.image_count ?? 0) > 0;
}

/** True when the primary catalog photo is in moderation PENDING. */
export function itemPhotoInReview(item: CatalogPhotoMenuItem): boolean {
  if (!itemDisplayImageUrl(item)) return false;
  if (item.pending_review_image_url) return true;
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  if (primaryMod === "REJECTED") return false;
  if (primaryMod === "PENDING") return true;
  // No image-row status yet: fall back to item approval pending.
  return String(item.approval_status ?? "").toUpperCase() === "PENDING";
}

/** True when the primary photo (or legacy item approval) is rejected. */
export function itemPhotoRejected(item: CatalogPhotoMenuItem): boolean {
  if (!itemDisplayImageUrl(item)) return false;
  if (item.pending_review_image_url) return false;
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  if (primaryMod === "REJECTED") return true;
  return String(item.approval_status ?? "").toUpperCase() === "REJECTED";
}

export function itemPrimaryImageRejected(item: CatalogPhotoMenuItem): boolean {
  return String(item.primary_image_moderation_status ?? "").toUpperCase() === "REJECTED";
}

export function normalizeImageModerationStatus(
  status: string | null | undefined,
): "APPROVED" | "REJECTED" | "PENDING" {
  const s = (status ?? "PENDING").trim().toUpperCase();
  if (s === "APPROVED" || s === "REJECTED") return s;
  return "PENDING";
}

export type MenuApprovalBadgeKind = "image_rejected" | "pending" | "rejected" | "approved";

export type MenuApprovalBadge = {
  kind: MenuApprovalBadgeKind;
  label: string;
  reason: string | null;
};

/**
 * Card badge for Partner Menu / Control Merchant Portal.
 * Photo reject keeps approval_status PENDING|APPROVED while primary image is REJECTED —
 * never show "Pending Approval" in that case.
 *
 * Orphaned approval_status=PENDING (no change request / no pending photo) must not show
 * "Pending Approval" — Admin queues are the source of truth.
 */
export function resolveMenuApprovalBadge(
  item: CatalogPhotoMenuItem,
  opts?: { pendingLabel?: string; showApproved?: boolean },
): MenuApprovalBadge | null {
  const approval = String(item.approval_status ?? "PENDING").toUpperCase();
  const reason = typeof item.rejection_reason === "string" ? item.rejection_reason.trim() || null : null;
  const pendingLabel = opts?.pendingLabel ?? "Pending Approval";
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  const photoPending =
    Boolean(item.pending_review_image_url) ||
    (Boolean(itemDisplayImageUrl(item)) && primaryMod === "PENDING");
  const changePending = Boolean(item.has_pending_change_request);
  const hasRealPendingWork = changePending || photoPending;

  if (itemPrimaryImageRejected(item)) {
    return { kind: "image_rejected", label: "Image rejected", reason };
  }

  if (approval === "REJECTED") {
    return { kind: "rejected", label: "Rejected", reason };
  }

  // Only show pending when Admin actually has something to review.
  if (approval === "PENDING" && hasRealPendingWork) {
    return { kind: "pending", label: pendingLabel, reason: null };
  }

  if (approval === "APPROVED" && opts?.showApproved) {
    return { kind: "approved", label: "Approved", reason: null };
  }

  return null;
}

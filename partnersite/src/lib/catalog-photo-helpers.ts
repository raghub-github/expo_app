export type CatalogPhotoMenuItem = {
  id: number;
  item_image_url?: string | null;
  image_count?: number | null;
  approval_status?: string | null;
  primary_image_moderation_status?: string | null;
};

export function itemHasCatalogPhoto(item: CatalogPhotoMenuItem): boolean {
  return Boolean(item.item_image_url) || (item.image_count ?? 0) > 0;
}

export function itemPhotoInReview(item: CatalogPhotoMenuItem): boolean {
  if (!item.item_image_url) return false;
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  if (primaryMod === "PENDING") return true;
  return String(item.approval_status ?? "").toUpperCase() === "PENDING";
}

export function itemPhotoRejected(item: CatalogPhotoMenuItem): boolean {
  if (!item.item_image_url) return false;
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  if (primaryMod === "REJECTED") return true;
  return String(item.approval_status ?? "").toUpperCase() === "REJECTED";
}

export function normalizeImageModerationStatus(
  status: string | null | undefined,
): "APPROVED" | "REJECTED" | "PENDING" {
  const s = (status ?? "PENDING").trim().toUpperCase();
  if (s === "APPROVED" || s === "REJECTED") return s;
  return "PENDING";
}

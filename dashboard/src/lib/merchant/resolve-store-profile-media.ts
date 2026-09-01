import { getSql } from "@/lib/db/client";
import { getChildStoreProgress } from "@/lib/db/operations/child-store-progress";
import {
  coerceGalleryImageList,
  normalizeStoreProfileMediaForApi,
} from "@/lib/merchant/store-profile-media";

type StoreMediaSource = {
  id: number;
  parent_id?: number | null;
  banner_url?: string | null;
  gallery_images?: unknown;
};

function step5Banner(step5: Record<string, unknown>): string | null {
  const raw =
    (typeof step5.banner_url === "string" && step5.banner_url) ||
    (typeof step5.banner_preview === "string" && step5.banner_preview) ||
    null;
  const t = raw ? String(raw).trim() : "";
  return t || null;
}

function step5Gallery(step5: Record<string, unknown>): unknown[] | null {
  const raw = step5.gallery_image_urls ?? step5.gallery_previews;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw;
}

/**
 * Profile/verification display: merchant_stores columns first, then onboarding
 * progress (step 5), then merchant_store_media_files BANNER/GALLERY — same
 * fallbacks the public restaurant API uses.
 */
export async function resolveStoreProfileMediaForDisplay(
  store: StoreMediaSource
): Promise<{ banner_url: string | null; gallery_images: string[] | null }> {
  let bannerUrl =
    typeof store.banner_url === "string" && store.banner_url.trim()
      ? store.banner_url.trim()
      : null;
  let galleryImages: unknown = store.gallery_images ?? null;

  if (!bannerUrl || coerceGalleryImageList(galleryImages).length === 0) {
    const parentId = store.parent_id ?? null;
    try {
      let step5: Record<string, unknown> | undefined;
      if (parentId != null) {
        const progress = await getChildStoreProgress(parentId, store.id);
        step5 = progress?.form_data?.step5 as Record<string, unknown> | undefined;
      }
      if (!step5) {
        const sql = getSql();
        const rows = await sql`
          SELECT form_data
          FROM merchant_store_registration_progress
          WHERE store_id = ${store.id}
          ORDER BY id DESC
          LIMIT 1
        `;
        const row = Array.isArray(rows) ? rows[0] : rows;
        const form = (row as { form_data?: Record<string, unknown> } | null)?.form_data;
        if (form && typeof form.step5 === "object" && form.step5) {
          step5 = form.step5 as Record<string, unknown>;
        }
      }
      if (step5) {
        if (!bannerUrl) bannerUrl = step5Banner(step5);
        if (coerceGalleryImageList(galleryImages).length === 0) {
          const g = step5Gallery(step5);
          if (g) galleryImages = g;
        }
      }
    } catch (e) {
      console.warn("[resolveStoreProfileMedia] registration progress fallback:", e);
    }
  }

  if (!bannerUrl || coerceGalleryImageList(galleryImages).length === 0) {
    try {
      const sql = getSql();
      const mediaRows = await sql`
        SELECT media_scope, r2_key, public_url, menu_url
        FROM merchant_store_media_files
        WHERE store_id = ${store.id}
          AND is_active = true
          AND deleted_at IS NULL
          AND media_scope IN ('BANNER', 'GALLERY')
        ORDER BY created_at ASC
      `;
      const rows = Array.isArray(mediaRows) ? mediaRows : mediaRows ? [mediaRows] : [];
      const gallery = coerceGalleryImageList(galleryImages);
      for (const row of rows as Array<Record<string, unknown>>) {
        const scope = String(row.media_scope ?? "").toUpperCase();
        const raw =
          (typeof row.public_url === "string" && row.public_url.trim()) ||
          (typeof row.menu_url === "string" && row.menu_url.trim()) ||
          (typeof row.r2_key === "string" && row.r2_key.trim()) ||
          "";
        if (!raw) continue;
        if (scope === "BANNER" && !bannerUrl) bannerUrl = raw;
        if (scope === "GALLERY" && !gallery.includes(raw)) gallery.push(raw);
      }
      if (gallery.length) galleryImages = gallery;
    } catch (e) {
      console.warn("[resolveStoreProfileMedia] media_files fallback:", e);
    }
  }

  return normalizeStoreProfileMediaForApi(bannerUrl, galleryImages);
}

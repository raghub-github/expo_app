import { client as sql } from "@/lib/drizzle";
import { normalizeMerchantStoreMediaUrl, toStoredDocumentUrl } from "@/lib/r2";

function coerceGalleryImageList(val: unknown): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.flatMap((x) => (x == null ? [] : String(x).trim())).filter(Boolean);
  }
  if (typeof val === "string") {
    const t = val.trim();
    if (!t) return [];
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        const p = JSON.parse(t) as unknown;
        if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean);
      } catch {
        /* ignore */
      }
    }
    return t
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function step5Banner(step5: Record<string, unknown>): string | null {
  const raw =
    (typeof step5.banner_url === "string" && step5.banner_url) ||
    (typeof step5.banner_preview === "string" && step5.banner_preview) ||
    null;
  const t = raw ? String(raw).trim() : "";
  if (!t || t.startsWith("data:") || t.startsWith("blob:")) return null;
  return normalizeMerchantStoreMediaUrl(t) ?? t;
}

function step5Gallery(step5: Record<string, unknown>): string[] {
  const raw = step5.gallery_image_urls ?? step5.gallery_previews;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && !!x.trim() && !x.startsWith("data:") && !x.startsWith("blob:"))
    .map((u) => normalizeMerchantStoreMediaUrl(u.trim()) ?? u.trim())
    .filter(Boolean);
}

type StoreMediaSource = {
  id: number | string;
  parent_id?: number | string | null;
  banner_url?: string | null;
  gallery_images?: unknown;
  store_banner_url?: string | null;
};

/**
 * Profile media for partner dashboard: merchant_stores columns first, then
 * onboarding progress step5, then merchant_store_media_files BANNER/GALLERY.
 * Matches dashboard resolveStoreProfileMediaForDisplay.
 */
export async function resolveStoreProfileMediaForDisplay(
  store: StoreMediaSource
): Promise<{ banner_url: string | null; gallery_images: string[] }> {
  let bannerUrl =
    (typeof store.banner_url === "string" && store.banner_url.trim()
      ? store.banner_url.trim()
      : null) ||
    (typeof store.store_banner_url === "string" && store.store_banner_url.trim()
      ? store.store_banner_url.trim()
      : null);
  if (bannerUrl) {
    bannerUrl = normalizeMerchantStoreMediaUrl(bannerUrl) ?? bannerUrl;
  }

  let galleryImages = coerceGalleryImageList(store.gallery_images).map(
    (u) => normalizeMerchantStoreMediaUrl(u) ?? u
  );

  const storePk = typeof store.id === "string" ? parseInt(store.id, 10) : store.id;
  if (!Number.isFinite(storePk)) {
    return { banner_url: bannerUrl, gallery_images: galleryImages };
  }

  if (!bannerUrl || galleryImages.length === 0) {
    try {
      const rows = await sql`
        SELECT form_data
        FROM merchant_store_registration_progress
        WHERE store_id = ${storePk}
        ORDER BY id DESC
        LIMIT 1
      `;
      const row = rows[0] as { form_data?: Record<string, unknown> } | undefined;
      const form = row?.form_data;
      const step5 =
        form && typeof form.step5 === "object" && form.step5
          ? (form.step5 as Record<string, unknown>)
          : null;
      if (step5) {
        if (!bannerUrl) bannerUrl = step5Banner(step5);
        if (galleryImages.length === 0) {
          const g = step5Gallery(step5);
          if (g.length) galleryImages = g;
        }
      }
    } catch (e) {
      console.warn("[resolveStoreProfileMedia] registration progress fallback:", e);
    }
  }

  if (!bannerUrl || galleryImages.length === 0) {
    try {
      const mediaRows = await sql`
        SELECT media_scope, r2_key, public_url, menu_url
        FROM merchant_store_media_files
        WHERE store_id = ${storePk}
          AND is_active = true
          AND deleted_at IS NULL
          AND media_scope IN ('BANNER', 'GALLERY')
        ORDER BY created_at ASC
      `;
      for (const row of mediaRows as Array<Record<string, unknown>>) {
        const scope = String(row.media_scope ?? "").toUpperCase();
        const raw =
          (typeof row.public_url === "string" && row.public_url.trim()) ||
          (typeof row.menu_url === "string" && row.menu_url.trim()) ||
          (typeof row.r2_key === "string" && row.r2_key.trim()) ||
          "";
        if (!raw) continue;
        const normalized = normalizeMerchantStoreMediaUrl(raw) ?? raw;
        if (scope === "BANNER" && !bannerUrl) bannerUrl = normalized;
        if (scope === "GALLERY" && !galleryImages.includes(normalized)) {
          galleryImages.push(normalized);
        }
      }
    } catch (e) {
      console.warn("[resolveStoreProfileMedia] media_files fallback:", e);
    }
  }

  return { banner_url: bannerUrl, gallery_images: galleryImages };
}

/**
 * When banner exists only in onboarding progress / media files, write it onto
 * merchant_stores so subsequent profile loads and customer apps see it.
 */
export async function backfillStoreBannerUrlIfMissing(
  storePk: number,
  bannerUrl: string | null | undefined,
  existingBannerUrl: string | null | undefined
): Promise<void> {
  const existing =
    typeof existingBannerUrl === "string" && existingBannerUrl.trim()
      ? existingBannerUrl.trim()
      : "";
  if (existing) return;
  const next =
    typeof bannerUrl === "string" && bannerUrl.trim() ? bannerUrl.trim() : "";
  if (!next) return;
  const stored = toStoredDocumentUrl(next) ?? next;
  try {
    await sql`
      UPDATE merchant_stores
      SET banner_url = ${stored}, updated_at = NOW()
      WHERE id = ${storePk}
        AND (banner_url IS NULL OR btrim(banner_url) = '')
    `;
  } catch (e) {
    console.warn("[resolveStoreProfileMedia] banner backfill failed:", e);
  }
}

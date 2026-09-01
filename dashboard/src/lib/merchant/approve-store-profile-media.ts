import { getSql } from "@/lib/db/client";
import { applyPendingFieldResubmissions } from "@/lib/db/operations/onboarding-resubmissions";
import { coerceGalleryImageList } from "@/lib/merchant/store-profile-media";
import { resolveStoreProfileMediaForDisplay } from "@/lib/merchant/resolve-store-profile-media";

export type ProfileMediaKind = "banner" | "gallery";

function fieldKeysForKinds(kinds: ProfileMediaKind[]): string[] {
  const keys: string[] = [];
  if (kinds.includes("banner")) keys.push("banner_url");
  if (kinds.includes("gallery")) keys.push("gallery_images");
  return keys;
}

async function persistBannerIfEmpty(storeId: number, url: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE merchant_stores
    SET banner_url = ${url},
        updated_at = now()
    WHERE id = ${storeId}
      AND (banner_url IS NULL OR btrim(banner_url) = '')
  `;
}

async function persistGalleryIfEmpty(storeId: number, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const sql = getSql();
  await sql`
    UPDATE merchant_stores
    SET gallery_images = ${sql.array(urls)}::text[],
        updated_at = now()
    WHERE id = ${storeId}
      AND (gallery_images IS NULL OR cardinality(gallery_images) = 0)
  `;
}

async function markProfileMediaFilesVerified(params: {
  storeId: number;
  scopes: Array<"BANNER" | "GALLERY">;
  verifiedByAuthId: string | null;
}): Promise<void> {
  if (params.scopes.length === 0) return;
  const sql = getSql();
  const verifiedAtIso = new Date().toISOString();
  for (const scope of params.scopes) {
    await sql`
      UPDATE merchant_store_media_files
      SET verification_status = 'VERIFIED',
          verified_at = ${verifiedAtIso},
          verified_by = ${params.verifiedByAuthId},
          updated_at = now()
      WHERE store_id = ${params.storeId}
        AND is_active = true
        AND deleted_at IS NULL
        AND media_scope = ${scope}
        AND verification_status IS DISTINCT FROM 'VERIFIED'
    `;
  }
}

/**
 * Approve banner and/or gallery: apply pending resubmits for those fields,
 * persist fallback URLs onto merchant_stores if columns are empty, mark
 * BANNER/GALLERY media files VERIFIED.
 */
export async function approveStoreProfileMedia(params: {
  storeId: number;
  kinds: ProfileMediaKind[];
  appliedBySystemUserId?: number | null;
  verifiedByAuthId?: string | null;
}): Promise<{
  appliedPending: number;
  bannerApproved: boolean;
  galleryApproved: boolean;
}> {
  const kinds = [...new Set(params.kinds)].filter(
    (k): k is ProfileMediaKind => k === "banner" || k === "gallery"
  );
  if (kinds.length === 0) {
    return { appliedPending: 0, bannerApproved: false, galleryApproved: false };
  }

  const appliedPending = await applyPendingFieldResubmissions({
    storeId: params.storeId,
    fieldKeys: fieldKeysForKinds(kinds),
    appliedBySystemUserId: params.appliedBySystemUserId ?? null,
  });

  const sql = getSql();
  const storeRows = await sql`
    SELECT id, parent_id, banner_url, gallery_images
    FROM merchant_stores
    WHERE id = ${params.storeId}
    LIMIT 1
  `;
  const store = (Array.isArray(storeRows) ? storeRows[0] : storeRows) as
    | {
        id: number;
        parent_id?: number | null;
        banner_url?: string | null;
        gallery_images?: unknown;
      }
    | undefined;
  if (!store) {
    return {
      appliedPending,
      bannerApproved: kinds.includes("banner"),
      galleryApproved: kinds.includes("gallery"),
    };
  }

  const resolved = await resolveStoreProfileMediaForDisplay({
    id: store.id,
    parent_id: store.parent_id ?? null,
    banner_url: store.banner_url ?? null,
    gallery_images: store.gallery_images ?? null,
  });

  const scopes: Array<"BANNER" | "GALLERY"> = [];
  if (kinds.includes("banner")) {
    if (resolved.banner_url) {
      await persistBannerIfEmpty(params.storeId, resolved.banner_url);
    }
    scopes.push("BANNER");
  }
  if (kinds.includes("gallery")) {
    const gallery = coerceGalleryImageList(resolved.gallery_images);
    if (gallery.length > 0) {
      await persistGalleryIfEmpty(params.storeId, gallery);
    }
    scopes.push("GALLERY");
  }

  try {
    await markProfileMediaFilesVerified({
      storeId: params.storeId,
      scopes,
      verifiedByAuthId: params.verifiedByAuthId ?? null,
    });
  } catch (e) {
    console.warn("[approveStoreProfileMedia] media_files verify:", e);
  }

  return {
    appliedPending,
    bannerApproved: kinds.includes("banner"),
    galleryApproved: kinds.includes("gallery"),
  };
}

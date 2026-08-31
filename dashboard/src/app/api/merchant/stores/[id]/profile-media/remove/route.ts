/**
 * POST /api/merchant/stores/[id]/profile-media/remove
 * Body: { key: string } or { url: string } — deletes R2 object and updates merchant_stores banner/gallery fields.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateMerchantStoreForId } from "@/lib/merchant-store-route-auth";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { deleteDocument } from "@/lib/services/r2";
import {
  coerceGalleryImageList,
  profileMediaR2KeyFromUrl,
} from "@/lib/merchant/store-profile-media";
import { getR2MerchantObjectPrefix } from "@/lib/merchant/r2-store-asset-paths";
import { isSuperAdmin, hasAccessPoint } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { assertMerchantStoreMutation } from "@/lib/permissions/merchant-access";

export const runtime = "nodejs";

async function assertAdminBannerVideoAccess(user: { id: string; email?: string }): Promise<boolean> {
  const email = user.email?.trim() || "";
  if (await isSuperAdmin(user.id, email || undefined)) return true;
  if (!email) return false;
  const systemUser = await getSystemUserByEmail(email);
  if (!systemUser) return false;
  return hasAccessPoint(systemUser.id, "MERCHANT", "MERCHANT_ADMIN_MERCHANT_ACCESS");
}

async function assertStoreAccess(request: NextRequest, storeId: number) {
  const access = await authenticateMerchantStoreForId(request, storeId);
  if (!access.ok) {
    const status = access.response.status;
    return {
      ok: false as const,
      status,
      error:
        status === 401
          ? "Not authenticated"
          : status === 404
            ? "Store not found"
            : "Forbidden",
    };
  }
  const areaManagerId = await resolveMerchantListAreaManagerId({
    supabaseAuthId: access.user.id,
    email: access.user.email ?? "",
  });
  return { ok: true as const, store: access.store, areaManagerId, user: access.user };
}

async function resolveParentIdForPath(
  storeId: number,
  store: { parent_id?: number | null }
): Promise<number | null> {
  if (typeof store.parent_id === "number" && Number.isFinite(store.parent_id)) {
    return store.parent_id;
  }
  const sql = getSql();
  const rows = await sql`
    SELECT parent_id
    FROM merchant_stores
    WHERE id = ${storeId}
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || (row as { parent_id?: unknown }).parent_id == null) return null;
  const parsed = Number((row as { parent_id: unknown }).parent_id);
  return Number.isFinite(parsed) ? parsed : null;
}

function keyAllowedForStore(
  key: string,
  storeId: number,
  store_id: string | null | undefined,
  parentId: number
): boolean {
  const code = (store_id && String(store_id).trim()) || `GMMC${storeId}`;
  const root = `${getR2MerchantObjectPrefix()}/${parentId}/stores/${code}`;
  const partnerAssets = `${root}/assets/`;
  const legacyOnboarding = `${root}/onboarding/assets/`;
  const underPartner =
    key.startsWith(partnerAssets) &&
    (key.includes("/banners/") || key.includes("/gallery/") || key.includes("/videos/"));
  const underLegacy =
    key.startsWith(legacyOnboarding) && (key.includes("/banner/") || key.includes("/gallery/"));
  return underPartner || underLegacy;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(request, storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const mutation = await assertMerchantStoreMutation(access.user.id, access.user.email ?? "", [
      "can_update_store_details",
    ]);
    if (!mutation.ok) {
      return NextResponse.json({ success: false, error: mutation.error }, { status: mutation.status });
    }

    const body = await request.json().catch(() => ({}));
    const rawKey = typeof body.key === "string" ? body.key.trim() : "";
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const mediaType = typeof body.type === "string" ? body.type.trim() : "";

    const storeRow = access.store as { store_id?: string; parent_id?: number | null };
    const parentIdForPath = await resolveParentIdForPath(storeId, storeRow);
    if (parentIdForPath == null) {
      return NextResponse.json(
        { success: false, error: "Parent id not found for store" },
        { status: 400 }
      );
    }

    const areaManagerId = access.areaManagerId;
    const fresh = await getMerchantStoreById(storeId, areaManagerId);
    if (!fresh) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 500 });
    }

    let key = rawKey || profileMediaR2KeyFromUrl(rawUrl) || "";
    if (!key && mediaType === "banner_video" && fresh.banner_video_url) {
      key = profileMediaR2KeyFromUrl(String(fresh.banner_video_url)) || "";
    }
    if (!key) {
      return NextResponse.json(
        { success: false, error: "Provide key or resolvable url" },
        { status: 400 }
      );
    }
    console.log("[profile-media/remove] request", { storeId, key, mediaType: mediaType || undefined });

    if (!keyAllowedForStore(key, storeId, storeRow.store_id, parentIdForPath)) {
      console.warn("[profile-media/remove] key not allowed for store", {
        storeId,
        key,
        storeCode: storeRow.store_id,
        parentIdForPath,
      });
      return NextResponse.json(
        { success: false, error: "Key does not belong to this store profile media path" },
        { status: 403 }
      );
    }

    const bKey = profileMediaR2KeyFromUrl(String(fresh.banner_url ?? ""));
    const vKey = profileMediaR2KeyFromUrl(String(fresh.banner_video_url ?? ""));
    const gList = coerceGalleryImageList(fresh.gallery_images);
    const isBanner = bKey === key;
    const isBannerVideo = Boolean(vKey) && vKey === key;
    const inGallery = gList.some((u) => profileMediaR2KeyFromUrl(u) === key);
    if (!isBanner && !isBannerVideo && !inGallery) {
      console.warn("[profile-media/remove] key not attached to store", {
        storeId,
        key,
        bannerKey: bKey,
        bannerVideoKey: vKey,
        galleryCount: gList.length,
        mediaType: mediaType || undefined,
      });
      return NextResponse.json(
        { success: false, error: "This media is not attached to this store" },
        { status: 400 }
      );
    }

    if (isBannerVideo) {
      const videoAllowed = await assertAdminBannerVideoAccess({
        id: access.user.id,
        email: access.user.email,
      });
      if (!videoAllowed) {
        return NextResponse.json(
          { success: false, error: "Only admin can remove store banner video" },
          { status: 403 }
        );
      }
    }

    const newBanner = isBanner ? null : fresh.banner_url;
    const newBannerVideo = isBannerVideo ? null : fresh.banner_video_url;
    const newGallery = gList.filter((u) => profileMediaR2KeyFromUrl(u) !== key);
    const galleryPayload = newGallery.length > 0 ? newGallery : null;

    await updateMerchantStore(storeId, areaManagerId, {
      banner_url: newBanner ?? null,
      banner_video_url: newBannerVideo ?? null,
      gallery_images: galleryPayload,
    });
    console.log("[profile-media/remove] db updated", {
      storeId,
      removedKey: key,
      isBanner,
      isBannerVideo,
      galleryAfter: newGallery.length,
    });

    try {
      await deleteDocument(key);
    } catch (delErr) {
      console.warn("[profile-media/remove] R2 delete after DB update:", delErr);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[POST profile-media/remove]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Remove failed" },
      { status: 500 }
    );
  }
}

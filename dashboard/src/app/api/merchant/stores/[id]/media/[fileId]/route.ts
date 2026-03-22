/**
 * PATCH /api/merchant/stores/[id]/media/[fileId]
 * Body: { verification_status: "PENDING" | "VERIFIED" | "REJECTED", entry_id?: string }
 * - With entry_id + ONBOARDING_MENU_IMAGE + JSONB bundle: updates that image entry and syncs row aggregate status.
 * - Without entry_id (or legacy single-image row): updates the media row's verification_status.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import {
  aggregateBundleVerificationStatus,
  parseMenuReferenceImageUrls,
  patchBundleEntryVerification,
  stableEntryIdForUrl,
} from "@/lib/menu-reference-image-bundle";
import {
  mapRowToMenuMediaFile,
  ONBOARDING_MENU_IMAGE,
  type MenuMediaFile,
} from "@/lib/merchant-menu-media";

export const runtime = "nodejs";

const STATUSES = new Set(["PENDING", "VERIFIED", "REJECTED"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const { id, fileId: fileIdParam } = await params;
    const storeId = parseInt(id, 10);
    const fileId = parseInt(fileIdParam, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(fileId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const verificationStatus =
      typeof body.verification_status === "string" ? body.verification_status.toUpperCase().trim() : "";
    if (!STATUSES.has(verificationStatus)) {
      return NextResponse.json(
        { success: false, error: "verification_status must be PENDING, VERIFIED, or REJECTED" },
        { status: 400 }
      );
    }
    const entryId = typeof body.entry_id === "string" ? body.entry_id.trim() : "";

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Merchant dashboard access required", code: "MERCHANT_ACCESS_REQUIRED" },
        { status: 403 }
      );
    }

    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }

    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT id, store_id, media_scope, source_entity, original_file_name, r2_key, public_url, menu_url,
             mime_type, file_size_bytes, verification_status, created_at, menu_reference_image_urls
      FROM merchant_store_media_files
      WHERE id = ${fileId}
        AND store_id = ${storeId}
        AND is_active = true
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const rowRaw = Array.isArray(rows) ? rows[0] : rows;
    if (!rowRaw) {
      return NextResponse.json({ success: false, error: "Media file not found" }, { status: 404 });
    }

    const row = rowRaw as Record<string, unknown>;
    const sourceEntity = row.source_entity != null ? String(row.source_entity) : null;
    const bundleParsed = parseMenuReferenceImageUrls(row.menu_reference_image_urls);

    if (entryId && sourceEntity === ONBOARDING_MENU_IMAGE && bundleParsed.length > 0) {
      const currentEntry = bundleParsed.find((e) => e.id === entryId);
      const currentSt = String(currentEntry?.verification_status ?? "PENDING").toUpperCase();
      if (currentSt === "VERIFIED" && verificationStatus !== "VERIFIED") {
        return NextResponse.json(
          {
            success: false,
            error:
              "This menu image is already verified. It cannot be rejected or reset; only new or pending images need review.",
          },
          { status: 409 }
        );
      }
      if (currentSt === "REJECTED") {
        if (verificationStatus === "VERIFIED") {
          return NextResponse.json(
            {
              success: false,
              error:
                "This image was rejected. The merchant must upload a replacement from the partner site before it can be verified.",
            },
            { status: 409 }
          );
        }
        if (verificationStatus === "PENDING") {
          return NextResponse.json(
            {
              success: false,
              error:
                "A rejected menu image cannot be reset to pending. Wait for the merchant to re-upload from the partner site.",
            },
            { status: 409 }
          );
        }
      }
      const patch = patchBundleEntryVerification(row.menu_reference_image_urls, entryId, verificationStatus as "PENDING" | "VERIFIED" | "REJECTED");
      if (!patch) {
        return NextResponse.json({ success: false, error: "Unknown entry_id for this bundle" }, { status: 400 });
      }
      const updatedEntries = parseMenuReferenceImageUrls(patch.next);
      const agg = aggregateBundleVerificationStatus(updatedEntries);
      // postgres.js tagged templates expect strings (or primitives it maps); Date throws ERR_INVALID_ARG_TYPE.
      const verifiedAtIso = agg === "VERIFIED" ? new Date().toISOString() : null;
      const verifiedBy = agg === "VERIFIED" ? user.id : null;

      const bundleJson = JSON.stringify(patch.next);
      await sql`
        UPDATE merchant_store_media_files
        SET menu_reference_image_urls = ${bundleJson}::jsonb,
            verification_status = ${agg},
            verified_at = ${verifiedAtIso},
            verified_by = ${verifiedBy},
            updated_at = now()
        WHERE id = ${fileId}
          AND store_id = ${storeId}
      `;
    } else if (entryId && sourceEntity === ONBOARDING_MENU_IMAGE && bundleParsed.length === 0) {
      const u = String(row.menu_url || row.public_url || "").trim();
      if (!u || stableEntryIdForUrl(u) !== entryId) {
        return NextResponse.json({ success: false, error: "Unknown entry_id for this file" }, { status: 400 });
      }
      const rowSt = String(row.verification_status ?? "PENDING").toUpperCase();
      if (rowSt === "VERIFIED" && verificationStatus !== "VERIFIED") {
        return NextResponse.json(
          {
            success: false,
            error:
              "This menu image is already verified. It cannot be rejected or reset; only new or pending images need review.",
          },
          { status: 409 }
        );
      }
      if (rowSt === "REJECTED") {
        if (verificationStatus === "VERIFIED") {
          return NextResponse.json(
            {
              success: false,
              error:
                "This image was rejected. The merchant must upload a replacement from the partner site before it can be verified.",
            },
            { status: 409 }
          );
        }
        if (verificationStatus === "PENDING") {
          return NextResponse.json(
            {
              success: false,
              error:
                "A rejected menu image cannot be reset to pending. Wait for the merchant to re-upload from the partner site.",
            },
            { status: 409 }
          );
        }
      }
      const verifiedAtIso = verificationStatus === "VERIFIED" ? new Date().toISOString() : null;
      const verifiedBy = verificationStatus === "VERIFIED" ? user.id : null;
      await sql`
        UPDATE merchant_store_media_files
        SET verification_status = ${verificationStatus},
            verified_at = ${verifiedAtIso},
            verified_by = ${verifiedBy},
            updated_at = now()
        WHERE id = ${fileId}
          AND store_id = ${storeId}
      `;
    } else if (!entryId) {
      if (sourceEntity === ONBOARDING_MENU_IMAGE && bundleParsed.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This menu row has multiple reference images. Use entry_id to accept or reject each image.",
          },
          { status: 400 }
        );
      }
      const rowStSingle = String(row.verification_status ?? "PENDING").toUpperCase();
      if (rowStSingle === "VERIFIED" && verificationStatus !== "VERIFIED") {
        return NextResponse.json(
          {
            success: false,
            error:
              "This menu file is already verified. It cannot be rejected or reset without replacing the file.",
          },
          { status: 409 }
        );
      }
      if (rowStSingle === "REJECTED") {
        if (verificationStatus === "VERIFIED") {
          return NextResponse.json(
            {
              success: false,
              error:
                "This file was rejected. The merchant must upload a replacement from the partner site before it can be verified.",
            },
            { status: 409 }
          );
        }
        if (verificationStatus === "PENDING") {
          return NextResponse.json(
            {
              success: false,
              error:
                "A rejected menu file cannot be reset to pending. Wait for the merchant to re-upload from the partner site.",
            },
            { status: 409 }
          );
        }
      }
      const verifiedAtIso = verificationStatus === "VERIFIED" ? new Date().toISOString() : null;
      const verifiedBy = verificationStatus === "VERIFIED" ? user.id : null;
      await sql`
        UPDATE merchant_store_media_files
        SET verification_status = ${verificationStatus},
            verified_at = ${verifiedAtIso},
            verified_by = ${verifiedBy},
            updated_at = now()
        WHERE id = ${fileId}
          AND store_id = ${storeId}
      `;
    } else {
      return NextResponse.json(
        { success: false, error: "entry_id applies only to menu image reference rows" },
        { status: 400 }
      );
    }

    const outRows = await sql`
      SELECT id, store_id, media_scope, source_entity, original_file_name, r2_key, public_url, menu_url,
             mime_type, file_size_bytes, verification_status, created_at, menu_reference_image_urls
      FROM merchant_store_media_files
      WHERE id = ${fileId}
        AND store_id = ${storeId}
      LIMIT 1
    `;
    const outRaw = Array.isArray(outRows) ? outRows[0] : outRows;
    const file: MenuMediaFile = mapRowToMenuMediaFile(outRaw as Record<string, unknown>);

    return NextResponse.json({ success: true, file });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/media/[fileId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/merchant/stores/[id]/media/delete-menu
 * Remove a MENU_REFERENCE media file for a store and delete from R2.
 *
 * Body: { fileId?: number; r2Key?: string }
 * If neither fileId nor r2Key is provided, all MENU_REFERENCE files for this store are deleted.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { deleteDocument } from "@/lib/services/r2";

export const runtime = "nodejs";

function extractR2KeyFromProxyUrl(url: string): string {
  try {
    const fakeOrigin = "https://local.invalid";
    const u = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url)
      : new URL(url, fakeOrigin);
    const key = u.searchParams.get("key");
    return key ? decodeURIComponent(key) : "";
  } catch {
    return "";
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid store id" },
        { status: 400 }
      );
    }

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
        {
          success: false,
          error: "Merchant dashboard access required",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });

    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const fileId = body?.fileId != null ? Number(body.fileId) : null;
    const bodyKey =
      typeof body?.r2Key === "string" && body.r2Key.trim()
        ? (body.r2Key as string)
        : null;

    const sql = getSql();
    // If no identifiers provided: delete ALL MENU_REFERENCE media for this store.
    if (!bodyKey && (!fileId || !Number.isFinite(fileId))) {
      const rows = await sql`
        SELECT source_entity, r2_key, menu_reference_image_urls
        FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
      `;
      const allRows = Array.isArray(rows) ? rows : rows ? [rows] : [];
      for (const row of allRows as {
        source_entity: string | null;
        r2_key: string | null;
        menu_reference_image_urls?: unknown;
      }[]) {
        if (row.source_entity === "ONBOARDING_MENU_IMAGE") {
          const bundle = Array.isArray(row.menu_reference_image_urls)
            ? (row.menu_reference_image_urls as Array<{ url?: string }>)
            : [];
          for (const entry of bundle) {
            const key = extractR2KeyFromProxyUrl(String(entry?.url ?? ""));
            if (!key) continue;
            try {
              await deleteDocument(key);
            } catch (e) {
              console.warn(
                "[DELETE /api/merchant/stores/[id]/media/delete-menu] R2 delete failed for image key:",
                key,
                e
              );
            }
          }
          continue;
        }
        if (!row.r2_key) continue;
        const normalizedKey = row.r2_key.includes("/api/attachments/proxy")
          ? extractR2KeyFromProxyUrl(row.r2_key)
          : row.r2_key;
        if (!normalizedKey) continue;
        try {
          await deleteDocument(normalizedKey);
        } catch (e) {
          console.warn(
            "[DELETE /api/merchant/stores/[id]/media/delete-menu] R2 delete failed for key:",
            normalizedKey,
            e
          );
        }
      }
      await sql`
        DELETE FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
      `;

      // Do not auto-reset onboarding step on menu deletion.
      // UI already reflects current state in-place and should stay on same step.
    } else {
      let r2Key: string | null = bodyKey;
      const normalizedBodyKey = bodyKey
        ? bodyKey.includes("/api/attachments/proxy")
          ? extractR2KeyFromProxyUrl(bodyKey)
          : bodyKey
        : null;

      if (normalizedBodyKey) {
        const rows = await sql`
          SELECT id, menu_reference_image_urls
          FROM merchant_store_media_files
          WHERE store_id = ${storeId}
            AND media_scope = 'MENU_REFERENCE'
            AND source_entity = 'ONBOARDING_MENU_IMAGE'
            AND deleted_at IS NULL
          LIMIT 1
        `;
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (row && Array.isArray((row as { menu_reference_image_urls?: unknown }).menu_reference_image_urls)) {
          const bundle = ((row as { menu_reference_image_urls?: unknown }).menu_reference_image_urls ??
            []) as Array<{
            id?: string;
            url?: string;
            file_name?: string;
            verification_status?: string;
          }>;
          const nextBundle = bundle.filter((entry) => {
            const key = extractR2KeyFromProxyUrl(String(entry?.url ?? ""));
            return key !== normalizedBodyKey;
          });
          if (nextBundle.length !== bundle.length) {
            try {
              await deleteDocument(normalizedBodyKey);
            } catch (e) {
              console.warn(
                "[DELETE /api/merchant/stores/[id]/media/delete-menu] R2 delete failed:",
                e
              );
            }
            if (nextBundle.length === 0) {
              await sql`
                DELETE FROM merchant_store_media_files
                WHERE id = ${(row as { id: number }).id}
              `;
            } else {
              const nextMenuUrl = nextBundle[0]?.url ?? null;
              const nextR2Key = nextMenuUrl
                ? extractR2KeyFromProxyUrl(nextMenuUrl)
                : null;
              const nextNames = nextBundle
                .map((entry) => String(entry.file_name ?? "").trim())
                .filter(Boolean)
                .join(", ");
              const nextBundleJson = JSON.stringify(nextBundle);
              await sql`
                UPDATE merchant_store_media_files
                SET original_file_name = ${nextNames || null},
                    r2_key = ${nextR2Key},
                    public_url = ${nextMenuUrl},
                    menu_url = ${nextMenuUrl},
                    menu_reference_image_urls = CAST(${nextBundleJson} AS jsonb),
                    updated_at = NOW()
                WHERE id = ${(row as { id: number }).id}
              `;
            }
            return NextResponse.json({ success: true });
          }
        }
      }

      if (!r2Key) {
        const rows = await sql`
          SELECT id, r2_key
          FROM merchant_store_media_files
          WHERE id = ${fileId}
            AND store_id = ${storeId}
            AND media_scope = 'MENU_REFERENCE'
            AND deleted_at IS NULL
        `;
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) {
          return NextResponse.json(
            { success: false, error: "File not found" },
            { status: 404 }
          );
        }
        r2Key = String(row.r2_key);
        if (r2Key.includes("/api/attachments/proxy")) {
          const parsed = extractR2KeyFromProxyUrl(r2Key);
          r2Key = parsed || r2Key;
        }
      }

      try {
        await deleteDocument(r2Key!);
      } catch (e) {
        console.warn(
          "[DELETE /api/merchant/stores/[id]/media/delete-menu] R2 delete failed:",
          e
        );
      }

      await sql`
        DELETE FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
          AND r2_key = ${r2Key}
      `;

      const remainingImages = await sql`
        SELECT id, public_url, original_file_name, verification_status
        FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
          AND source_entity = 'ONBOARDING_MENU_IMAGE'
          AND is_active = true
        ORDER BY created_at ASC
      `;
      const imageRows = (Array.isArray(remainingImages)
        ? remainingImages
        : remainingImages
          ? [remainingImages]
          : []) as {
        id: number | string;
        public_url: string | null;
        original_file_name: string | null;
        verification_status: string | null;
      }[];
      if (imageRows.length > 0) {
        const imageBundle = imageRows.map((row) => ({
          id: String(row.id),
          url: String(row.public_url ?? ""),
          file_name: String(row.original_file_name ?? ""),
          verification_status: String(row.verification_status ?? "PENDING"),
        }));
        const primaryMenuUrl = imageBundle[0]?.url ?? null;
        const imageBundleJson = JSON.stringify(imageBundle);
        await sql`
          UPDATE merchant_store_media_files
          SET menu_url = ${primaryMenuUrl},
              menu_reference_image_urls = CAST(${imageBundleJson} AS jsonb)
          WHERE store_id = ${storeId}
            AND media_scope = 'MENU_REFERENCE'
            AND source_entity = 'ONBOARDING_MENU_IMAGE'
            AND is_active = true
        `;
      }

      // Do not auto-reset onboarding step on menu deletion.
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(
      "[DELETE /api/merchant/stores/[id]/media/delete-menu]",
      e
    );
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}


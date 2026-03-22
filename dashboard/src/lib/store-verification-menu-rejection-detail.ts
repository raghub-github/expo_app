/**
 * Server: build MENU_REFERENCE snapshot for step-3 rejection persistence.
 */
import { getSql } from "@/lib/db/client";
import { mapRowToMenuMediaFile, ONBOARDING_MENU_IMAGE } from "@/lib/merchant-menu-media";
import type { MenuReferenceRejectionDetail, MenuReferenceRejectionDetailFile } from "./store-verification-menu-rejection-detail-shared";

export type { MenuReferenceRejectionDetail, MenuReferenceRejectionDetailFile } from "./store-verification-menu-rejection-detail-shared";
export { parseMenuReferenceRejectionDetail } from "./store-verification-menu-rejection-detail-shared";

function mediaKindLabel(source: string | null): string {
  if (!source) return "Menu file";
  if (source === ONBOARDING_MENU_IMAGE) return "Menu photos";
  if (source === "ONBOARDING_MENU_PDF") return "Menu PDF";
  if (source === "ONBOARDING_MENU_SHEET") return "Menu spreadsheet (CSV / Excel)";
  return source.replace(/^ONBOARDING_/, "").replace(/_/g, " ");
}

export async function buildMenuReferenceRejectionDetailSnapshot(
  storeId: number
): Promise<MenuReferenceRejectionDetail | null> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT id, store_id, media_scope, source_entity, original_file_name, r2_key, public_url, menu_url,
             mime_type, file_size_bytes, verification_status, created_at, menu_reference_image_urls
      FROM merchant_store_media_files
      WHERE store_id = ${storeId}
        AND media_scope = 'MENU_REFERENCE'
        AND is_active = true
        AND deleted_at IS NULL
      ORDER BY created_at ASC
    `;
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    if (list.length === 0) return null;

    const files: MenuReferenceRejectionDetailFile[] = list.map((r) => {
      const f = mapRowToMenuMediaFile(r as Record<string, unknown>);
      return {
        media_file_id: f.id,
        source_entity: f.source_entity,
        label: mediaKindLabel(f.source_entity),
        row_verification_status: f.verification_status,
        original_file_name: f.original_file_name,
        reference_images: f.reference_images?.map((e) => ({
          entry_id: e.id,
          file_name: e.file_name ?? null,
          verification_status: e.verification_status,
        })),
      };
    });

    return {
      version: 1,
      kind: "MENU_REFERENCE",
      captured_at: new Date().toISOString(),
      files,
    };
  } catch (e) {
    console.warn("[buildMenuReferenceRejectionDetailSnapshot]", e);
    return null;
  }
}

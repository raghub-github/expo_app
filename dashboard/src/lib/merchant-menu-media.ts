/**
 * Shared menu reference media types + row mapping (safe for client components — no server-only imports).
 */
import { parseMenuReferenceImageUrls, stableEntryIdForUrl } from "@/lib/menu-reference-image-bundle";

export const ONBOARDING_MENU_IMAGE = "ONBOARDING_MENU_IMAGE";

export type MenuMediaFile = {
  id: number;
  store_id: number;
  media_scope: string;
  source_entity: string | null;
  menu_url: string | null;
  original_file_name: string | null;
  r2_key: string | null;
  public_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  verification_status: string;
  created_at: string;
  /** ONBOARDING_MENU_IMAGE: URLs from menu_reference_image_urls JSONB (or legacy single URL). */
  reference_images?: Array<{
    id: string;
    url: string;
    file_name?: string | null;
    verification_status: string;
  }>;
};

export function mapRowToMenuMediaFile(r: Record<string, unknown>): MenuMediaFile {
  const sourceEntity = r.source_entity != null ? String(r.source_entity) : null;
  const menuUrlRaw = r.menu_url != null ? String(r.menu_url).trim() : "";
  const parsed = parseMenuReferenceImageUrls(r.menu_reference_image_urls);
  let reference_images: MenuMediaFile["reference_images"];
  if (sourceEntity === ONBOARDING_MENU_IMAGE) {
    if (parsed.length > 0) {
      reference_images = parsed.map((e) => ({
        id: e.id,
        url: e.url,
        file_name: e.file_name ?? null,
        verification_status: e.verification_status ?? "PENDING",
      }));
    } else {
      const u = String(r.menu_url || r.public_url || "").trim();
      if (u) {
        reference_images = [
          {
            id: stableEntryIdForUrl(u),
            url: u,
            file_name: r.original_file_name != null ? String(r.original_file_name) : null,
            verification_status: String(r.verification_status ?? "PENDING"),
          },
        ];
      }
    }
  }
  return {
    id: Number(r.id),
    store_id: Number(r.store_id),
    media_scope: String(r.media_scope),
    source_entity: sourceEntity,
    menu_url: menuUrlRaw || null,
    original_file_name: r.original_file_name != null ? String(r.original_file_name) : null,
    r2_key: r.r2_key != null && String(r.r2_key).trim() ? String(r.r2_key) : null,
    public_url: r.public_url != null ? String(r.public_url) : null,
    mime_type: r.mime_type != null ? String(r.mime_type) : null,
    file_size_bytes: r.file_size_bytes != null ? Number(r.file_size_bytes) : null,
    verification_status: String(r.verification_status ?? "PENDING"),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    reference_images,
  };
}

import { getSql } from "../db/client.js";
import { toAbsoluteClientMediaUrl } from "../utils/publicAttachmentUrl.js";

export type UserAppCategoryAllTab = {
  label: string;
  imageUrl: string | null;
};

const DEFAULT_ALL_TAB: UserAppCategoryAllTab = {
  label: "All",
  imageUrl: null,
};

export async function getUserAppCategoryAllTab(storeType: string): Promise<UserAppCategoryAllTab> {
  const st = storeType.trim().toUpperCase();
  const sql = getSql();
  const rows = await sql<
    Array<{ all_tab_label: string | null; all_tab_image_url: string | null }>
  >`
    SELECT all_tab_label, all_tab_image_url
    FROM public.user_app_category_meta
    WHERE store_type = ${st}::store_type
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return { ...DEFAULT_ALL_TAB };
  const label = row.all_tab_label?.trim() || DEFAULT_ALL_TAB.label;
  return {
    label,
    imageUrl: toAbsoluteClientMediaUrl(row.all_tab_image_url),
  };
}

export async function upsertUserAppCategoryAllTab(
  storeType: string,
  patch: { label?: string; imageUrl?: string | null }
): Promise<UserAppCategoryAllTab> {
  const st = storeType.trim().toUpperCase();
  const current = await getUserAppCategoryAllTab(st);
  const label = patch.label?.trim() || current.label || DEFAULT_ALL_TAB.label;
  const imageUrl =
    patch.imageUrl === undefined ? current.imageUrl : patch.imageUrl?.trim() || null;
  const sql = getSql();
  await sql`
    INSERT INTO public.user_app_category_meta (store_type, all_tab_label, all_tab_image_url, updated_at)
    VALUES (${st}::store_type, ${label}, ${imageUrl}, now())
    ON CONFLICT (store_type) DO UPDATE SET
      all_tab_label = EXCLUDED.all_tab_label,
      all_tab_image_url = EXCLUDED.all_tab_image_url,
      updated_at = now()
  `;
  return getUserAppCategoryAllTab(st);
}

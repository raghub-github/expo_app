import { getSql } from "../../db/client.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";

const ALLOWED_STORE_TYPES = new Set([
  "GENERAL",
  "FOOD",
  "GROCERY",
  "RESTAURANT",
  "CLOUD_KITCHEN",
  "WAREHOUSE",
  "STORE",
  "GARAGE",
  "PHARMA",
  "STATIONERY",
  "CAFE",
  "BAKERY",
  "OTHERS",
  "FASHION",
]);

export type UserAppCategoryDto = {
  id: number;
  name: string;
  imageUrl: string | null;
  displayOrder: number;
  storeType: string;
  status: string;
};

export async function listUserAppCategories(params: { storeType: string }): Promise<UserAppCategoryDto[]> {
  const st = params.storeType.trim().toUpperCase();
  if (!ALLOWED_STORE_TYPES.has(st)) {
    return [];
  }
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, image_url, display_order, store_type, status
    FROM public.user_app_category
    WHERE store_type = ${st}::store_type
      AND status = 'active'
    ORDER BY display_order ASC, id ASC
  `;
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    imageUrl: toAbsoluteClientMediaUrl(r.image_url),
    displayOrder: Number(r.display_order ?? 0),
    storeType: String(r.store_type),
    status: String(r.status),
  }));
}

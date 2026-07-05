import { getSql } from "../../db/client.js";
import { getMerchantParentIdForStore } from "./categoryRules.js";

export type MenuImageUploadStatus = {
  totalUsed: number;
  maxImageUploads: number | null;
  imageUploadAllowed: boolean;
  imageLimitReached: boolean;
  imageSlotsLeft: number | null;
};

export async function getMenuImageUploadStatus(storeIdNum: number): Promise<MenuImageUploadStatus> {
  const sql = getSql();
  const [countRow] = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c
    FROM merchant_menu_items
    WHERE store_id = ${storeIdNum}
      AND item_image_url IS NOT NULL
      AND TRIM(item_image_url) <> ''
  `;
  const totalUsed = Number(countRow?.c ?? 0);

  const parentId = await getMerchantParentIdForStore(storeIdNum);
  let maxImageUploads: number | null = null;
  let imageUploadAllowed = true;

  if (parentId != null) {
    const [planRow] = await sql<
      {
        max_image_uploads: number | null;
        image_upload_allowed: boolean | null;
      }[]
    >`
      SELECT mp.max_image_uploads, mp.image_upload_allowed
      FROM merchant_subscriptions ms
      JOIN merchant_plans mp ON mp.id = ms.plan_id
      WHERE ms.merchant_id = ${parentId}
        AND (ms.store_id IS NULL OR ms.store_id = ${storeIdNum})
        AND ms.is_active = TRUE
        AND ms.subscription_status = 'ACTIVE'
        AND ms.expiry_date > NOW()
      ORDER BY ms.expiry_date DESC
      LIMIT 1
    `;

    if (planRow) {
      maxImageUploads =
        planRow.max_image_uploads != null ? Number(planRow.max_image_uploads) : null;
      imageUploadAllowed =
        planRow.image_upload_allowed === true ||
        (maxImageUploads != null && maxImageUploads > 0);
    } else {
      const [freeRow] = await sql<
        {
          max_image_uploads: number | null;
          image_upload_allowed: boolean | null;
        }[]
      >`
        SELECT max_image_uploads, image_upload_allowed
        FROM merchant_plans
        WHERE plan_code = 'FREE' AND is_active = TRUE
        LIMIT 1
      `;
      if (freeRow) {
        maxImageUploads =
          freeRow.max_image_uploads != null ? Number(freeRow.max_image_uploads) : null;
        imageUploadAllowed =
          freeRow.image_upload_allowed === true ||
          (maxImageUploads != null && maxImageUploads > 0);
      }
    }
  }

  const imageLimitReached =
    maxImageUploads != null && Number.isFinite(maxImageUploads) && totalUsed >= maxImageUploads;
  const imageSlotsLeft =
    maxImageUploads != null ? Math.max(0, maxImageUploads - totalUsed) : null;

  return {
    totalUsed,
    maxImageUploads,
    imageUploadAllowed,
    imageLimitReached,
    imageSlotsLeft,
  };
}

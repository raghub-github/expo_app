import { client as pgClient } from "@/lib/drizzle";
import { deleteFromR2 } from "@/lib/r2";

/**
 * Photo uploads go to Image Review via merchant_menu_item_images.moderation_status.
 * Do NOT flip live approval_status APPROVED → PENDING — that falsely shows
 * "Pending Approval" on Partner Menu while Admin queues are empty.
 * Kept as a touch/updated_at helper for call-site compatibility.
 */
export async function setItemPendingForReReview(
  itemId: number,
  storeIdNum: number,
  opts: { changed_by: string; changed_by_role?: string },
): Promise<boolean> {
  void opts;
  const result = await pgClient`
    UPDATE merchant_menu_items
    SET updated_at = NOW()
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  return (result.count ?? 0) > 0;
}

export async function addItemImageRow(
  menuItemId: number,
  storeIdNum: number,
  data: {
    image_url: string;
    r2_key?: string | null;
    is_primary?: boolean;
    format?: string | null;
    display_order?: number;
    /** When true (platform Admin/staff), image + item apply live without review. */
    autoApprove?: boolean;
    moderated_by?: string | null;
  },
): Promise<{ id: number }> {
  const [owned] = await pgClient`
    SELECT id FROM merchant_menu_items
    WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
    LIMIT 1
  `;
  if (!owned) throw new Error("ITEM_NOT_FOUND");

  const makePrimary = data.is_primary !== false;
  const autoApprove = data.autoApprove === true;
  const moderationStatus = autoApprove ? "APPROVED" : "PENDING";
  const moderatedBy = autoApprove ? (data.moderated_by ?? null) : null;
  const [orderRow] = await pgClient`
    SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
    FROM merchant_menu_item_images
    WHERE menu_item_id = ${menuItemId}
  `;
  const nextOrder = data.display_order ?? Number((orderRow as { next_order?: number })?.next_order ?? 0);

  // Reuse an existing row for the same URL instead of inserting duplicates
  // (duplicate keys break the partner photo carousel).
  const [existingSame] = await pgClient`
    SELECT id FROM merchant_menu_item_images
    WHERE menu_item_id = ${menuItemId}
      AND TRIM(image_url) = ${data.image_url}
    ORDER BY is_primary DESC, id DESC
    LIMIT 1
  `;

  let imageId: number;
  if (existingSame) {
    imageId = Number((existingSame as { id: number }).id);
    if (makePrimary) {
      await pgClient`
        UPDATE merchant_menu_item_images
        SET is_primary = false, updated_at = NOW()
        WHERE menu_item_id = ${menuItemId} AND is_primary = true AND id != ${imageId}
      `;
    }
    if (autoApprove) {
      await pgClient`
        UPDATE merchant_menu_item_images
        SET is_primary = ${makePrimary},
            moderation_status = 'APPROVED',
            rejection_reason = NULL,
            moderated_at = NOW(),
            moderated_by = ${moderatedBy},
            r2_key = COALESCE(${data.r2_key ?? null}, r2_key),
            updated_at = NOW()
        WHERE id = ${imageId}
      `;
    } else {
      await pgClient`
        UPDATE merchant_menu_item_images
        SET is_primary = ${makePrimary},
            moderation_status = 'PENDING',
            rejection_reason = NULL,
            moderated_at = NULL,
            moderated_by = NULL,
            r2_key = COALESCE(${data.r2_key ?? null}, r2_key),
            updated_at = NOW()
        WHERE id = ${imageId}
      `;
    }
  } else {
    if (makePrimary) {
      await pgClient`
        UPDATE merchant_menu_item_images
        SET is_primary = false, updated_at = NOW()
        WHERE menu_item_id = ${menuItemId} AND is_primary = true
      `;
    }

    const [row] = autoApprove
      ? await pgClient`
          INSERT INTO merchant_menu_item_images (
            menu_item_id, image_url, r2_key, is_primary, format, display_order,
            moderation_status, rejection_reason, moderated_at, moderated_by
          )
          VALUES (
            ${menuItemId}, ${data.image_url}, ${data.r2_key ?? null}, ${makePrimary},
            ${data.format ?? null}, ${nextOrder}, ${moderationStatus}, NULL, NOW(), ${moderatedBy}
          )
          RETURNING id
        `
      : await pgClient`
          INSERT INTO merchant_menu_item_images (
            menu_item_id, image_url, r2_key, is_primary, format, display_order,
            moderation_status, rejection_reason, moderated_at, moderated_by
          )
          VALUES (
            ${menuItemId}, ${data.image_url}, ${data.r2_key ?? null}, ${makePrimary},
            ${data.format ?? null}, ${nextOrder}, 'PENDING', NULL, NULL, NULL
          )
          RETURNING id
        `;
    imageId = Number((row as { id: number }).id);
  }

  if (makePrimary) {
    const [itemRow] = await pgClient`
      SELECT approval_status::text AS approval_status
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      LIMIT 1
    `;
    const prevStatus = String((itemRow as { approval_status?: string })?.approval_status ?? "").toUpperCase();
    const wasApproved = prevStatus === "APPROVED";

    if (autoApprove) {
      await pgClient`
        UPDATE merchant_menu_items
        SET item_image_url = ${data.image_url},
            approval_status = 'APPROVED'::merchant_menu_item_approval_status,
            rejection_reason = NULL,
            approved_at = COALESCE(approved_at, NOW()),
            approved_by = COALESCE(approved_by, ${moderatedBy}),
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    } else if (wasApproved) {
      await pgClient`
        UPDATE merchant_menu_items
        SET item_image_url = ${data.image_url},
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    } else {
      // Keep existing approval_status; Image Review is driven by image moderation_status.
      await pgClient`
        UPDATE merchant_menu_items
        SET item_image_url = ${data.image_url},
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    }
  }

  return { id: imageId };
}

export async function deleteItemImage(imageId: number, storeIdNum: number): Promise<boolean> {
  const [img] = await pgClient`
    SELECT i.id, i.r2_key, i.is_primary, i.menu_item_id
    FROM merchant_menu_item_images i
    INNER JOIN merchant_menu_items m ON m.id = i.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE i.id = ${imageId}
    LIMIT 1
  `;
  if (!img) return false;

  const menuItemId = Number((img as { menu_item_id: number }).menu_item_id);
  const wasPrimary = !!(img as { is_primary?: boolean }).is_primary;
  const keyToDelete = (img as { r2_key?: string | null }).r2_key;

  if (keyToDelete && typeof keyToDelete === "string") {
    try {
      await deleteFromR2(keyToDelete);
    } catch {
      /* best-effort */
    }
  }

  const result = await pgClient`DELETE FROM merchant_menu_item_images WHERE id = ${imageId}`;

  if ((result.count ?? 0) > 0 && wasPrimary) {
    const [nextPrimary] = await pgClient`
      SELECT id, image_url, moderation_status, rejection_reason
      FROM merchant_menu_item_images
      WHERE menu_item_id = ${menuItemId}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    if (nextPrimary) {
      await pgClient`
        UPDATE merchant_menu_item_images
        SET is_primary = true, updated_at = NOW()
        WHERE id = ${(nextPrimary as { id: number }).id}
      `;
      const nextUrl = (nextPrimary as { image_url: string }).image_url;
      const nextRejection: string | null =
        (nextPrimary as { rejection_reason?: string | null }).rejection_reason ?? null;
      const modStatus = String((nextPrimary as { moderation_status?: string }).moderation_status ?? "PENDING").toUpperCase();
      // Update live image URL / rejection note only — do not flip item approval_status.
      await pgClient`
        UPDATE merchant_menu_items
        SET item_image_url = ${nextUrl},
            rejection_reason = ${modStatus === "REJECTED" ? nextRejection : null},
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    } else {
      await pgClient`
        UPDATE merchant_menu_items
        SET item_image_url = NULL,
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    }
  }

  return (result.count ?? 0) > 0;
}

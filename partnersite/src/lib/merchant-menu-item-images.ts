import { client as pgClient } from "@/lib/drizzle";
import { deleteFromR2 } from "@/lib/r2";

export async function setItemPendingForReReview(
  itemId: number,
  storeIdNum: number,
  opts: { changed_by: string; changed_by_role?: string },
): Promise<boolean> {
  const [before] = await pgClient`
    SELECT approval_status::text AS approval_status
    FROM merchant_menu_items
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
    LIMIT 1
  `;
  const previousStatus = before ? String((before as { approval_status?: string }).approval_status ?? "") : null;
  const result = await pgClient`
    UPDATE merchant_menu_items
    SET approval_status = 'PENDING'::merchant_menu_item_approval_status,
        approved_at = NULL,
        approved_by = NULL,
        updated_at = NOW()
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  if ((result.count ?? 0) > 0 && previousStatus !== "PENDING") {
    try {
      await pgClient`
        INSERT INTO merchant_menu_item_approval_log (
          menu_item_id, previous_status, new_status, changed_by, changed_by_role, note
        )
        VALUES (
          ${itemId}, ${previousStatus}, 'PENDING', ${opts.changed_by},
          ${opts.changed_by_role ?? "merchant"}, 'Edited by merchant – pending re-review'
        )
      `;
    } catch {
      /* log table may not exist */
    }
  }
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
  },
): Promise<{ id: number }> {
  const [owned] = await pgClient`
    SELECT id FROM merchant_menu_items
    WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
    LIMIT 1
  `;
  if (!owned) throw new Error("ITEM_NOT_FOUND");

  const makePrimary = data.is_primary !== false;
  const [orderRow] = await pgClient`
    SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
    FROM merchant_menu_item_images
    WHERE menu_item_id = ${menuItemId}
  `;
  const nextOrder = data.display_order ?? Number((orderRow as { next_order?: number })?.next_order ?? 0);

  if (makePrimary) {
    await pgClient`
      UPDATE merchant_menu_item_images
      SET is_primary = false, updated_at = NOW()
      WHERE menu_item_id = ${menuItemId} AND is_primary = true
    `;
  }

  const [row] = await pgClient`
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
  const imageId = Number((row as { id: number }).id);

  if (makePrimary) {
    const [itemRow] = await pgClient`
      SELECT approval_status::text AS approval_status
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      LIMIT 1
    `;
    const prevStatus = String((itemRow as { approval_status?: string })?.approval_status ?? "").toUpperCase();
    const wasApproved = prevStatus === "APPROVED";

    if (wasApproved) {
      await pgClient`
        UPDATE merchant_menu_items
        SET item_image_url = ${data.image_url},
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    } else {
      await pgClient`
        UPDATE merchant_menu_items
        SET item_image_url = ${data.image_url},
            approval_status = 'PENDING'::merchant_menu_item_approval_status,
            rejection_reason = NULL,
            approved_at = NULL,
            approved_by = NULL,
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
      const modStatus = String((nextPrimary as { moderation_status?: string }).moderation_status ?? "PENDING").toUpperCase();
      const itemStatus = modStatus === "APPROVED" || modStatus === "REJECTED" ? modStatus : "PENDING";
      const nextUrl = (nextPrimary as { image_url: string }).image_url;
      const nextRejection: string | null =
        (nextPrimary as { rejection_reason?: string | null }).rejection_reason ?? null;
      if (itemStatus === "APPROVED") {
        await pgClient`
          UPDATE merchant_menu_items
          SET item_image_url = ${nextUrl},
              approval_status = 'APPROVED'::merchant_menu_item_approval_status,
              rejection_reason = NULL,
              updated_at = NOW()
          WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
        `;
      } else if (itemStatus === "REJECTED") {
        await pgClient`
          UPDATE merchant_menu_items
          SET item_image_url = ${nextUrl},
              approval_status = 'REJECTED'::merchant_menu_item_approval_status,
              rejection_reason = ${nextRejection},
              updated_at = NOW()
          WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
        `;
      } else {
        await pgClient`
          UPDATE merchant_menu_items
          SET item_image_url = ${nextUrl},
              approval_status = 'PENDING'::merchant_menu_item_approval_status,
              rejection_reason = NULL,
              updated_at = NOW()
          WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
        `;
      }
    } else {
      await pgClient`
        UPDATE merchant_menu_items
        SET item_image_url = NULL,
            approval_status = 'PENDING'::merchant_menu_item_approval_status,
            rejection_reason = NULL,
            approved_at = NULL,
            approved_by = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    }
  }

  return (result.count ?? 0) > 0;
}

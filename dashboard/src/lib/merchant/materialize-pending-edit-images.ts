/**
 * Partner EDIT used to park new photos in merchant_menu_item_review_changes
 * (field item_image_url), so they appeared under Changes Review instead of Image Review.
 *
 * Image Review only lists primary rows in merchant_menu_item_images with
 * moderation_status = PENDING. This helper materializes those stuck EDIT image
 * diffs into image rows and removes the image field from the change request.
 *
 * Idempotent / I/O-safe: only touches rows that still need materialization.
 */
import { getSql } from "@/lib/db/client";

function parseJsonbString(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    if ((t.startsWith('"') && t.endsWith('"')) || t.startsWith("{") || t.startsWith("[")) {
      try {
        const parsed = JSON.parse(t);
        if (typeof parsed === "string") return parsed.trim() || null;
        if (parsed != null) return String(parsed).trim() || null;
      } catch {
        /* fall through */
      }
    }
    return t.replace(/^"|"$/g, "").trim() || null;
  }
  return String(raw).trim() || null;
}

function extractR2Key(imageUrl: string): string | null {
  try {
    if (imageUrl.includes("key=")) {
      const u = new URL(imageUrl, "http://localhost");
      const key = u.searchParams.get("key");
      if (key) return decodeURIComponent(key);
    }
  } catch {
    /* ignore */
  }
  const m = /[?&]key=([^&]+)/.exec(imageUrl);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return null;
}

export async function materializePendingEditImages(opts?: {
  storeIdNum?: number | null;
}): Promise<{ materialized: number; cleanedRequests: number }> {
  const sql = getSql();
  const storeIdNum = opts?.storeIdNum ?? null;

  const rows = storeIdNum != null
    ? await sql`
        SELECT
          r.id AS review_id,
          r.menu_item_id,
          r.store_id,
          c.id AS change_id,
          c.new_value
        FROM merchant_menu_item_review_requests r
        INNER JOIN merchant_menu_item_review_changes c
          ON c.review_request_id = r.id
         AND c.field_name = 'item_image_url'
        WHERE r.status = 'PENDING'::merchant_menu_item_review_request_status
          AND r.request_type = 'EDIT'::merchant_menu_item_review_request_type
          AND r.menu_item_id IS NOT NULL
          AND r.store_id = ${storeIdNum}
        ORDER BY r.id ASC
      `
    : await sql`
        SELECT
          r.id AS review_id,
          r.menu_item_id,
          r.store_id,
          c.id AS change_id,
          c.new_value
        FROM merchant_menu_item_review_requests r
        INNER JOIN merchant_menu_item_review_changes c
          ON c.review_request_id = r.id
         AND c.field_name = 'item_image_url'
        WHERE r.status = 'PENDING'::merchant_menu_item_review_request_status
          AND r.request_type = 'EDIT'::merchant_menu_item_review_request_type
          AND r.menu_item_id IS NOT NULL
        ORDER BY r.id ASC
        LIMIT 200
      `;

  let materialized = 0;
  let cleanedRequests = 0;
  const touchedReviewIds = new Set<number>();

  for (const row of Array.isArray(rows) ? rows : []) {
    const r = row as Record<string, unknown>;
    const reviewId = Number(r.review_id);
    const menuItemId = Number(r.menu_item_id);
    const storeId = Number(r.store_id);
    const changeId = Number(r.change_id);
    const imageUrl = parseJsonbString(r.new_value);
    if (
      !Number.isFinite(reviewId) ||
      !Number.isFinite(menuItemId) ||
      !Number.isFinite(storeId) ||
      !Number.isFinite(changeId) ||
      !imageUrl
    ) {
      continue;
    }

    touchedReviewIds.add(reviewId);

    // Never re-insert after approve/reject — if this URL already exists on the item,
    // only clear the EDIT change field (re-inserting PENDING would resurrect the queue).
    const [existingSameUrl] = await sql`
      SELECT id, is_primary, moderation_status
      FROM merchant_menu_item_images
      WHERE menu_item_id = ${menuItemId}
        AND TRIM(image_url) = ${imageUrl}
      ORDER BY is_primary DESC, id DESC
      LIMIT 1
    `;

    if (!existingSameUrl) {
      await sql`
        UPDATE merchant_menu_item_images
        SET is_primary = false, updated_at = NOW()
        WHERE menu_item_id = ${menuItemId} AND is_primary = true
      `;
      const r2Key = extractR2Key(imageUrl);
      const format = /\.(webp|jpe?g|png|gif)$/i.exec(r2Key || imageUrl)?.[1]?.toLowerCase() ?? null;
      const [orderRow] = await sql`
        SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
        FROM merchant_menu_item_images
        WHERE menu_item_id = ${menuItemId}
      `;
      const nextOrder = Number((orderRow as { next_order?: number })?.next_order ?? 0);
      await sql`
        INSERT INTO merchant_menu_item_images (
          menu_item_id, image_url, r2_key, is_primary, format, display_order,
          moderation_status, rejection_reason, moderated_at, moderated_by
        )
        VALUES (
          ${menuItemId}, ${imageUrl}, ${r2Key}, true, ${format}, ${nextOrder},
          'PENDING', NULL, NULL, NULL
        )
      `;
      await sql`
        UPDATE merchant_menu_items
        SET item_image_url = ${imageUrl},
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeId}
      `;
      materialized += 1;
    }

    await sql`
      DELETE FROM merchant_menu_item_review_changes
      WHERE id = ${changeId}
    `;
  }

  for (const reviewId of touchedReviewIds) {
    const [left] = await sql`
      SELECT COUNT(*)::int AS c
      FROM merchant_menu_item_review_changes
      WHERE review_request_id = ${reviewId}
    `;
    const remaining = Number((left as { c?: number })?.c ?? 0);
    if (remaining === 0) {
      await sql`DELETE FROM merchant_menu_item_review_action_log WHERE review_request_id = ${reviewId}`;
      await sql`DELETE FROM merchant_menu_item_review_requests WHERE id = ${reviewId}`;
      cleanedRequests += 1;
    }
  }

  return { materialized, cleanedRequests };
}

import type postgres from "postgres";

const SAFE_SQL_ALIAS = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertSqlAlias(alias: string): string {
  if (!SAFE_SQL_ALIAS.test(alias)) {
    throw new Error(`Invalid SQL alias: ${alias}`);
  }
  return alias;
}

/** Item content may still be pending photo review — those items stay customer-visible. */
export function isCustomerVisibleMenuApprovalStatus(
  status: string | null | undefined
): boolean {
  const s = String(status ?? "").trim().toUpperCase();
  return s === "APPROVED" || s === "PENDING";
}

/**
 * Customer menu lists APPROVED items and PENDING items (photo / first review).
 * REJECTED content stays hidden.
 */
export function getCustomerVisibleApprovalExpr(
  sql: postgres.Sql,
  itemAlias = "m"
) {
  const a = assertSqlAlias(itemAlias);
  return sql.unsafe(
    `${a}.approval_status::text IN ('APPROVED', 'PENDING')`
  );
}

/**
 * Photo customers may see: a moderation-APPROVED image row (prefer primary),
 * else the legacy item_image_url only when the primary photo is not pending/rejected.
 * Unverified / rejected uploads must not be returned — the app shows a placeholder.
 */
export function getCustomerVisibleItemImageExpr(
  sql: postgres.Sql,
  itemAlias = "m"
) {
  const a = assertSqlAlias(itemAlias);
  return sql.unsafe(`(
    COALESCE(
      NULLIF(TRIM((
        SELECT img.image_url
        FROM merchant_menu_item_images img
        WHERE img.menu_item_id = ${a}.id
          AND UPPER(TRIM(COALESCE(img.moderation_status, ''))) = 'APPROVED'
        ORDER BY CASE WHEN img.is_primary THEN 0 ELSE 1 END, img.created_at DESC, img.id DESC
        LIMIT 1
      )), ''),
      CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM merchant_menu_item_images img
          WHERE img.menu_item_id = ${a}.id
            AND img.is_primary IS TRUE
            AND UPPER(TRIM(COALESCE(img.moderation_status, 'PENDING'))) IN ('PENDING', 'REJECTED')
        )
        THEN NULLIF(TRIM(${a}.item_image_url), '')
        ELSE NULL
      END
    )
  )`);
}

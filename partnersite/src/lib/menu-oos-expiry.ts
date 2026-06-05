import type postgres from "postgres";

/** See backend/src/lib/menu-oos-expiry.ts — keep in sync. */
export async function expireTimedMenuOutOfStockForStore(
  sql: postgres.Sql,
  storeIdNum: number
): Promise<void> {
  const marker = new Date().toISOString();

  await sql`
    UPDATE merchant_menu_items
    SET
      in_stock = TRUE,
      out_of_stock_until = NULL,
      out_of_stock_updated_at = ${marker},
      updated_at = NOW()
    WHERE store_id = ${storeIdNum}
      AND COALESCE(out_of_stock_manual, FALSE) = FALSE
      AND out_of_stock_until IS NOT NULL
      AND out_of_stock_until <= NOW()
      AND (is_deleted IS NULL OR is_deleted = FALSE)
  `;

  await sql`
    UPDATE merchant_menu_categories
    SET
      out_of_stock_until = NULL,
      out_of_stock_updated_at = ${marker},
      updated_at = NOW()
    WHERE store_id = ${storeIdNum}
      AND COALESCE(out_of_stock_manual, FALSE) = FALSE
      AND out_of_stock_until IS NOT NULL
      AND out_of_stock_until <= NOW()
      AND COALESCE(is_deleted, FALSE) = FALSE
  `;

  await sql`
    UPDATE merchant_menu_combos
    SET
      out_of_stock_until = NULL,
      out_of_stock_updated_at = ${marker},
      updated_at = NOW()
    WHERE store_id = ${storeIdNum}
      AND COALESCE(out_of_stock_manual, FALSE) = FALSE
      AND out_of_stock_until IS NOT NULL
      AND out_of_stock_until <= NOW()
      AND COALESCE(is_deleted, FALSE) = FALSE
  `;
}

import type postgres from "postgres";

/**
 * Persistently restore timed out-of-stock rows once out_of_stock_until has passed.
 * Manual OOS (out_of_stock_manual=true) is never auto-cleared.
 * Aligns DB state with effective_in_stock semantics used by customer + merchant UIs.
 */
export async function expireTimedMenuOutOfStockForStore(
  sql: postgres.Sql,
  storeIdNum: number
): Promise<void> {
  const marker = new Date().toISOString();

  // Item-level timed OOS (includes category-cascaded rows sharing the same until).
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

  // Category timed OOS — clear until; cascaded items already restored above when they shared the until.
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

  // Combo timed OOS.
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

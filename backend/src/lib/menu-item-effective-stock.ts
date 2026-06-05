import type postgres from "postgres";

/**
 * Customer / merchant effective in-stock — aligned with Partner Site `effectiveInStock`.
 *
 * Expects item alias `m` and category alias `c` in the surrounding query.
 * Uses out_of_stock_* as source of truth; legacy in_stock=false only blocks items
 * never touched by the OOS system (out_of_stock_updated_at IS NULL).
 */
export function getMenuItemEffectiveInStockExpr(sql: postgres.Sql) {
  return sql.unsafe(`(
    CASE
      WHEN COALESCE(m.out_of_stock_manual, FALSE) = TRUE THEN FALSE
      WHEN (m.out_of_stock_until IS NOT NULL AND m.out_of_stock_until > NOW()) THEN FALSE
      WHEN (
        (COALESCE(c.out_of_stock_manual, FALSE) = TRUE OR (c.out_of_stock_until IS NOT NULL AND c.out_of_stock_until > NOW()))
        AND c.out_of_stock_updated_at IS NOT NULL
        AND m.out_of_stock_updated_at IS NOT NULL
        AND c.out_of_stock_updated_at = m.out_of_stock_updated_at
      ) THEN FALSE
      WHEN COALESCE(m.out_of_stock_manual, FALSE) = FALSE
        AND m.out_of_stock_until IS NULL
        AND m.in_stock IS FALSE
        AND m.out_of_stock_updated_at IS NULL
      THEN FALSE
      ELSE TRUE
    END
  )`);
}

/** Effective in-stock for arbitrary item/category table aliases in a JOIN. */
export function getMenuItemEffectiveInStockForAliases(
  sql: postgres.Sql,
  itemAlias: string,
  categoryAlias: string
) {
  return sql.unsafe(`(
    CASE
      WHEN COALESCE(${itemAlias}.out_of_stock_manual, FALSE) = TRUE THEN FALSE
      WHEN (${itemAlias}.out_of_stock_until IS NOT NULL AND ${itemAlias}.out_of_stock_until > NOW()) THEN FALSE
      WHEN (
        (COALESCE(${categoryAlias}.out_of_stock_manual, FALSE) = TRUE OR (${categoryAlias}.out_of_stock_until IS NOT NULL AND ${categoryAlias}.out_of_stock_until > NOW()))
        AND ${categoryAlias}.out_of_stock_updated_at IS NOT NULL
        AND ${itemAlias}.out_of_stock_updated_at IS NOT NULL
        AND ${categoryAlias}.out_of_stock_updated_at = ${itemAlias}.out_of_stock_updated_at
      ) THEN FALSE
      WHEN COALESCE(${itemAlias}.out_of_stock_manual, FALSE) = FALSE
        AND ${itemAlias}.out_of_stock_until IS NULL
        AND ${itemAlias}.in_stock IS FALSE
        AND ${itemAlias}.out_of_stock_updated_at IS NULL
      THEN FALSE
      ELSE TRUE
    END
  )`);
}

/** Same semantics with full item table name (merchant-menu listItems join). */
export function getMenuItemEffectiveInStockExprFull(sql: postgres.Sql) {
  return sql.unsafe(`(
    CASE
      WHEN COALESCE(merchant_menu_items.out_of_stock_manual, FALSE) = TRUE THEN FALSE
      WHEN (merchant_menu_items.out_of_stock_until IS NOT NULL AND merchant_menu_items.out_of_stock_until > NOW()) THEN FALSE
      WHEN (
        (COALESCE(c.out_of_stock_manual, FALSE) = TRUE OR (c.out_of_stock_until IS NOT NULL AND c.out_of_stock_until > NOW()))
        AND c.out_of_stock_updated_at IS NOT NULL
        AND merchant_menu_items.out_of_stock_updated_at IS NOT NULL
        AND c.out_of_stock_updated_at = merchant_menu_items.out_of_stock_updated_at
      ) THEN FALSE
      WHEN COALESCE(merchant_menu_items.out_of_stock_manual, FALSE) = FALSE
        AND merchant_menu_items.out_of_stock_until IS NULL
        AND merchant_menu_items.in_stock IS FALSE
        AND merchant_menu_items.out_of_stock_updated_at IS NULL
      THEN FALSE
      ELSE TRUE
    END
  )`);
}

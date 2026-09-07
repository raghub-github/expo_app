import type postgres from "postgres";
import { itemNameMatchKey } from "@/lib/menu-xlsx-import";

type SqlLike = postgres.Sql | postgres.TransactionSql;

/**
 * Soft-delete extra live items that share a canonical name (e.g. "Chowmein Roll" / "Chowmein Rolls").
 * Keeps the oldest row (lowest id) in each group.
 */
export async function collapseDuplicateMenuItems(sql: SqlLike, storeId: number): Promise<number> {
  const rows = await sql<{ id: number; item_name: string }[]>`
    SELECT id, item_name
    FROM merchant_menu_items
    WHERE store_id = ${storeId}
      AND COALESCE(is_deleted, FALSE) = FALSE
    ORDER BY id ASC
  `;
  const extras: number[] = [];
  const keepByKey = new Map<string, number>();
  for (const row of rows) {
    const key = itemNameMatchKey(String(row.item_name ?? ""));
    if (!key) continue;
    if (!keepByKey.has(key)) {
      keepByKey.set(key, Number(row.id));
    } else {
      extras.push(Number(row.id));
    }
  }
  if (extras.length === 0) return 0;
  await sql`
    UPDATE merchant_menu_items
    SET is_deleted = TRUE, is_active = FALSE, updated_at = NOW()
    WHERE store_id = ${storeId}
      AND id IN ${sql(extras)}
  `;
  return extras.length;
}

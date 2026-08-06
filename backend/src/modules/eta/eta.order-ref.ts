/**
 * Resolve ETA order refs to canonical orders_core.order_id (GM…).
 * Accepts GM…, GMF… (formatted_order_id), or numeric orders_core.id.
 */
import { getSql } from "../../db/client.js";

export async function resolveCanonicalOrderIdText(
  orderRef: string
): Promise<string | null> {
  const trimmed = String(orderRef ?? "")
    .replace(/^#/, "")
    .trim();
  if (!trimmed) return null;

  const sql = getSql();
  const rows = await sql<Array<{ order_id: string }>>`
    SELECT order_id
    FROM orders_core
    WHERE order_id = ${trimmed}
       OR formatted_order_id = ${trimmed}
       OR UPPER(TRIM(COALESCE(formatted_order_id, ''))) = UPPER(${trimmed})
       OR id::text = ${trimmed}
    LIMIT 1
  `;
  const id = rows[0]?.order_id?.trim();
  return id || null;
}

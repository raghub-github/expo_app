import { getSql } from "../../db/client.js";

export async function getPartnerParentId(parentMerchantId: string): Promise<number | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id FROM merchant_parents WHERE parent_merchant_id = ${parentMerchantId} LIMIT 1
  `;
  const row = rows[0] as { id: number } | undefined;
  return row ? Number(row.id) : null;
}

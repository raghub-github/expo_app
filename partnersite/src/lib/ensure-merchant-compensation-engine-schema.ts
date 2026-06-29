import type { Sql } from "postgres";
import { client as pgClient } from "@/lib/drizzle";

let checked = false;

/** Partnersite: verify compensation tables exist (migrations run via SQL editor). */
export async function ensureMerchantCompensationEngineSchema(sql: Sql = pgClient): Promise<boolean> {
  if (checked) return true;
  try {
    const [row] = await sql<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'gm_merchant_compensation_engine_settings'
      ) AS ok
    `;
    checked = Boolean(row?.ok);
    return checked;
  } catch {
    return false;
  }
}

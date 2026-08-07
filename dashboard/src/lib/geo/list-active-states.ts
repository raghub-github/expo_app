import { getSql } from "@/lib/db/client";

export type GeoStateRow = { id: string; name: string };

/** Shared by CX App Home page (RSC) and geo states API. */
export async function listActiveStates(): Promise<GeoStateRow[]> {
  const sql = getSql();
  return sql<GeoStateRow[]>`
    SELECT id, name FROM states WHERE is_active = true ORDER BY lower(name)
  `;
}

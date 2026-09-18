import "server-only";

import { getSql, safeQuery } from "@/lib/db/client";

let ensured: Promise<void> | null = null;

/** I/O-safe ensure: CREATE IF NOT EXISTS only; never drops or mutates existing rows. */
export function ensureRiderFavoritesTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getSql();
      await safeQuery(
        "ensure-coredash-rider-favorites",
        () => sql`
          CREATE TABLE IF NOT EXISTS coredash_rider_favorites (
            id BIGSERIAL PRIMARY KEY,
            system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
            rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT coredash_rider_favorites_user_rider_uq UNIQUE (system_user_id, rider_id)
          )
        `,
        undefined
      );
      await safeQuery(
        "ensure-coredash-rider-favorites-user-idx",
        () => sql`
          CREATE INDEX IF NOT EXISTS coredash_rider_favorites_user_idx
          ON coredash_rider_favorites (system_user_id)
        `,
        undefined
      );
      await safeQuery(
        "ensure-coredash-rider-favorites-rider-idx",
        () => sql`
          CREATE INDEX IF NOT EXISTS coredash_rider_favorites_rider_idx
          ON coredash_rider_favorites (rider_id)
        `,
        undefined
      );
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

export async function listFavoriteRiderIds(systemUserId: number): Promise<number[]> {
  await ensureRiderFavoritesTable();
  const sql = getSql();
  const rows = await safeQuery(
    "list-rider-favorites",
    () =>
      sql<{ rider_id: number }[]>`
        SELECT rider_id
        FROM coredash_rider_favorites
        WHERE system_user_id = ${systemUserId}
        ORDER BY created_at DESC
      `,
    []
  );
  return rows.map((r) => Number(r.rider_id)).filter((id) => Number.isFinite(id) && id > 0);
}

export async function setRiderFavorite(
  systemUserId: number,
  riderId: number,
  favorite: boolean
): Promise<{ favorite: boolean }> {
  await ensureRiderFavoritesTable();
  const sql = getSql();
  if (favorite) {
    await safeQuery(
      "add-rider-favorite",
      () => sql`
        INSERT INTO coredash_rider_favorites (system_user_id, rider_id)
        VALUES (${systemUserId}, ${riderId})
        ON CONFLICT (system_user_id, rider_id) DO NOTHING
      `,
      undefined
    );
    return { favorite: true };
  }
  await safeQuery(
    "remove-rider-favorite",
    () => sql`
      DELETE FROM coredash_rider_favorites
      WHERE system_user_id = ${systemUserId} AND rider_id = ${riderId}
    `,
    undefined
  );
  return { favorite: false };
}

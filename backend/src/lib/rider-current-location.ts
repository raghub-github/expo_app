import { eq, or } from "drizzle-orm";
import { riderCurrentLocations } from "../db/schema.js";
import type { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

export type UpsertRiderCurrentLocationInput = {
  userId: string;
  riderId: number;
  deviceId?: string | null;
  lat: number;
  lng: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  accuracyM?: number | null;
  seenAt?: Date;
};

/**
 * One live GPS row per rider. Handles both unique keys:
 * - PK on user_id
 * - UNIQUE on rider_id
 * A plain ON CONFLICT (user_id) fails when rider_id already exists under a
 * different user_id (account remap / legacy rows) — that was the 500 on ping.
 */
export async function upsertRiderCurrentLocation(
  db: Db,
  args: UpsertRiderCurrentLocationInput
): Promise<void> {
  const now = args.seenAt ?? new Date();
  const values = {
    userId: args.userId,
    riderId: args.riderId,
    deviceId: args.deviceId ?? null,
    lat: args.lat,
    lng: args.lng,
    speedMps: args.speedMps ?? null,
    headingDeg: args.headingDeg ?? null,
    accuracyM: args.accuracyM ?? null,
    lastSeenAt: now,
    updatedAt: now,
  };

  await db.transaction(async (tx) => {
    // Clear any row that would collide on either unique key, then insert fresh.
    await tx
      .delete(riderCurrentLocations)
      .where(
        or(
          eq(riderCurrentLocations.userId, args.userId),
          eq(riderCurrentLocations.riderId, args.riderId)
        )
      );
    await tx.insert(riderCurrentLocations).values(values);
  });
}

/** Convert m/s from device GPS to km/h for legacy consumers. */
export function speedMpsToKmh(speedMps: number | null | undefined): number | null {
  if (speedMps == null || !Number.isFinite(speedMps)) return null;
  return speedMps * 3.6;
}

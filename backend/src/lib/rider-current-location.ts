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

export async function upsertRiderCurrentLocation(
  db: Db,
  args: UpsertRiderCurrentLocationInput
): Promise<void> {
  const now = args.seenAt ?? new Date();
  await db
    .insert(riderCurrentLocations)
    .values({
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
    })
    .onConflictDoUpdate({
      target: riderCurrentLocations.userId,
      set: {
        deviceId: args.deviceId ?? null,
        lat: args.lat,
        lng: args.lng,
        speedMps: args.speedMps ?? null,
        headingDeg: args.headingDeg ?? null,
        accuracyM: args.accuracyM ?? null,
        lastSeenAt: now,
        updatedAt: now,
      },
    });
}

/** Convert m/s from device GPS to km/h for legacy consumers. */
export function speedMpsToKmh(speedMps: number | null | undefined): number | null {
  if (speedMps == null || !Number.isFinite(speedMps)) return null;
  return speedMps * 3.6;
}

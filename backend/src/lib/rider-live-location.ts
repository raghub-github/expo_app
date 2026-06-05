import { riderLiveLocations } from "../db/schema.js";
import type { getDb } from "../db/client.js";

type Db = ReturnType<typeof getDb>;

export async function upsertRiderLiveLocation(
  db: Db,
  args: {
    riderId: number;
    lat: number;
    lng: number;
    speedKmh?: number | null;
    heading?: number | null;
    accuracyMeters?: number | null;
    updatedAt?: Date;
  }
): Promise<void> {
  const now = args.updatedAt ?? new Date();
  await db
    .insert(riderLiveLocations)
    .values({
      riderId: args.riderId,
      latitude: String(args.lat),
      longitude: String(args.lng),
      speedKmh: args.speedKmh != null ? String(args.speedKmh) : null,
      heading: args.heading != null ? String(args.heading) : null,
      accuracyMeters: args.accuracyMeters != null ? String(args.accuracyMeters) : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: riderLiveLocations.riderId,
      set: {
        latitude: String(args.lat),
        longitude: String(args.lng),
        speedKmh: args.speedKmh != null ? String(args.speedKmh) : null,
        heading: args.heading != null ? String(args.heading) : null,
        accuracyMeters: args.accuracyMeters != null ? String(args.accuracyMeters) : null,
        updatedAt: now,
      },
    });
}

/** Convert m/s from device GPS to km/h for storage. */
export function speedMpsToKmh(speedMps: number | null | undefined): number | null {
  if (speedMps == null || !Number.isFinite(speedMps)) return null;
  return speedMps * 3.6;
}

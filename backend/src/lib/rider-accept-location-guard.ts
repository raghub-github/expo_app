/**
 * GAP 2 (shared) — final location revalidation at accept, for food/parcel/ride.
 *
 * Wraps the pure decision (rider-accept-revalidation.ts) with the DB lookups (current GPS, current-
 * wave pickup radius) and the off/shadow/enforce mode. In `enforce` it throws a 409 so the order
 * returns to the pool; in `shadow` it only logs what it WOULD reject; `off` disables it. Infra
 * errors NEVER block accept — only the deliberate enforce rejection re-throws.
 */
import { getEnv } from "../config/env.js";
import {
  evaluateRiderAcceptRevalidation,
  riderAcceptRevalidationMessage,
} from "./rider-accept-revalidation.js";
import {
  resolveRiderAssignmentContext,
  resolveOrderDispatchRadiusMeters,
  haversineDistanceMeters,
  riderDispatchLocationStaleMaxAgeSeconds,
  type DispatchServiceType,
} from "./order-assignment-engine.js";

export async function enforceRiderAcceptLocationRevalidation(args: {
  riderId: number;
  orderCoreId: number;
  serviceType: DispatchServiceType;
  pickupLat: number | string | null | undefined;
  pickupLon: number | string | null | undefined;
  /** Admin force-assign bypass. */
  skip?: boolean;
}): Promise<void> {
  if (args.skip) return;
  const mode = getEnv().RIDER_ACCEPT_REVALIDATE_MODE;
  if (mode === "off") return;

  try {
    const [ctx, radiusMeters] = await Promise.all([
      resolveRiderAssignmentContext(args.riderId, { skipAssignmentCheck: true, allowStaleGps: true }),
      resolveOrderDispatchRadiusMeters(args.orderCoreId, args.serviceType).catch(() => 0),
    ]);
    const pickupLat = Number(args.pickupLat);
    const pickupLon = Number(args.pickupLon);
    const distanceMeters =
      ctx && Number.isFinite(pickupLat) && Number.isFinite(pickupLon)
        ? haversineDistanceMeters(ctx.lat, ctx.lng, pickupLat, pickupLon)
        : Number.POSITIVE_INFINITY;
    const gpsAgeSeconds = ctx
      ? Math.max(0, (Date.now() - ctx.locationUpdatedAt.getTime()) / 1000)
      : Number.POSITIVE_INFINITY;

    const decision = evaluateRiderAcceptRevalidation({
      hasGps: ctx != null,
      gpsAgeSeconds,
      distanceMeters,
      radiusMeters,
      staleMaxSeconds: riderDispatchLocationStaleMaxAgeSeconds(),
    });

    if (!decision.allow) {
      console.warn(
        "[accept-revalidate]",
        JSON.stringify({
          mode,
          riderId: args.riderId,
          orderCoreId: args.orderCoreId,
          serviceType: args.serviceType,
          reason: decision.reason,
          gpsAgeSeconds: Number.isFinite(gpsAgeSeconds) ? Math.round(gpsAgeSeconds) : null,
          distanceMeters: Number.isFinite(distanceMeters) ? Math.round(distanceMeters) : null,
          radiusMeters,
          action: mode === "enforce" ? "REJECTED" : "SHADOW_WOULD_REJECT",
        })
      );
      if (mode === "enforce") {
        throw Object.assign(new Error(riderAcceptRevalidationMessage(decision.reason)), {
          statusCode: 409,
          code: `accept_revalidate_${decision.reason}`,
        });
      }
    }
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      (err as { code?: string }).code?.startsWith("accept_revalidate_")
    ) {
      throw err;
    }
    console.warn("[accept-revalidate] skipped (infra)", (err as Error)?.message ?? err);
  }
}

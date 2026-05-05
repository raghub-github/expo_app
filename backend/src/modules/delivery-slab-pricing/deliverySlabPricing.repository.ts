import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { DeliveryActorType, DeliveryRateSlabRow, DeliveryServiceType } from "./types.js";

function toRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  return (raw as { rows?: unknown[] })?.rows?.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") ?? [];
}

function mapRows(list: Record<string, unknown>[]): DeliveryRateSlabRow[] {
  const out: DeliveryRateSlabRow[] = [];
  for (const r of list) {
    out.push({
      id: Number(r.id),
      geoLevel: String(r.geo_level),
      geoRefId: String(r.geo_ref_id),
      serviceType: String(r.service_type) as DeliveryServiceType,
      actorType: String(r.actor_type) as DeliveryActorType,
      minKm: Number(r.min_km),
      maxKm: r.max_km == null ? null : Number(r.max_km),
      baseFare: r.base_fare == null ? null : Number(r.base_fare),
      perKmRate: Number(r.per_km_rate),
      minCharge: r.min_charge == null ? null : Number(r.min_charge),
      waitingChargePerMin: r.waiting_charge_per_min == null ? null : Number(r.waiting_charge_per_min),
      surgeMultiplier: r.surge_multiplier == null ? null : Number(r.surge_multiplier),
      priority: Number(r.priority ?? 0),
      isActive: r.is_active === true,
    });
  }
  return out;
}

function uniqueStrings(xs: string[]): string[] {
  return [...new Set(xs.filter((x) => x.trim() !== ""))];
}

export async function loadEffectiveDeliveryRateSlabs(
  db: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    geoLevel: "state" | "region" | "district" | "division" | "post_office" | "pincode";
    geoRefId: string;
    serviceType: DeliveryServiceType;
    actorType: DeliveryActorType;
  }
): Promise<DeliveryRateSlabRow[]> {
  /**
   * Legacy compatibility:
   * Some environments still carry enum values in uppercase (FOOD/CUSTOMER/PINCODE),
   * while current schema uses lowercase. If we cast a mismatched value, Postgres
   * throws and caller silently falls back to default delivery fee (₹25), which is
   * exactly the symptom seen in checkout.
   *
   * We probe a small set of casing/value aliases and return the first non-empty
   * slab result. If all probes are valid but empty, we return empty; if all probes
   * fail by enum cast errors, also return empty.
   */
  const geoCandidates = uniqueStrings([args.geoLevel, args.geoLevel.toUpperCase()]);
  const actorCandidates = uniqueStrings([args.actorType, args.actorType.toUpperCase()]);
  const serviceCandidates = uniqueStrings([
    args.serviceType,
    args.serviceType.toUpperCase(),
    args.serviceType === "person_ride" ? "ride" : args.serviceType,
    args.serviceType === "person_ride" ? "RIDE" : args.serviceType.toUpperCase(),
  ]);

  let firstEmptySuccess: DeliveryRateSlabRow[] | null = null;
  for (const geoLevel of geoCandidates) {
    for (const serviceType of serviceCandidates) {
      for (const actorType of actorCandidates) {
        try {
          const rows = await db.execute(sql`
            SELECT
              s.id,
              s.geo_level,
              s.geo_ref_id,
              s.service_type,
              s.actor_type,
              s.min_km,
              s.max_km,
              s.base_fare,
              s.per_km_rate,
              s.min_charge,
              s.waiting_charge_per_min,
              s.surge_multiplier,
              s.priority,
              s.is_active
            FROM delivery_rate_slabs_effective(
              ${geoLevel}::geo_pricing_level,
              ${args.geoRefId}::uuid,
              ${serviceType}::order_type,
              ${actorType}::delivery_actor_type
            ) s
          `);
          const mapped = mapRows(toRows(rows));
          if (mapped.length > 0) return mapped;
          if (firstEmptySuccess == null) firstEmptySuccess = mapped;
        } catch {
          // Try next alias.
        }
      }
    }
  }
  return firstEmptySuccess ?? [];
}


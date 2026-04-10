import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

// We use SQL strings to avoid coupling to a Drizzle schema migration in this step.
// Tables are created via dashboard/drizzle/0164_delivery_rate_card_engine.sql.

import type {
  DeliveryRateCardDataset,
  DemandLevelRow,
  DistanceSlabRow,
  RateCardRow,
  SpecialDayRow,
  TimeSlotRow,
  ZoneRow,
} from "./deliveryRateCard.types.js";

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
}

export async function loadDeliveryRateCardDataset(
  db: PostgresJsDatabase<Record<string, unknown>>
): Promise<DeliveryRateCardDataset> {
  const cards = await db.execute(sql`
    SELECT id, name, service_type::text as "serviceType", city_name as "cityName",
           priority, is_active as "isActive", metadata
    FROM delivery_rate_cards
    WHERE is_active = true
    ORDER BY priority ASC, id ASC
  `);

  const slabs = await db.execute(sql`
    SELECT id, rate_card_id as "rateCardId",
           min_km::text as "minKm", max_km::text as "maxKm",
           base_fare::text as "baseFare", per_km_rate::text as "perKmRate",
           priority
    FROM delivery_rate_card_distance_slabs
    ORDER BY rate_card_id ASC, priority ASC, id ASC
  `);

  const timeSlots = await db.execute(sql`
    SELECT id, rate_card_id as "rateCardId",
           start_min as "startMin", end_min as "endMin",
           surge_multiplier::text as "surgeMultiplier",
           is_weekend_only as "isWeekendOnly"
    FROM delivery_rate_card_time_slots
    ORDER BY rate_card_id ASC, id ASC
  `);

  const zones = await db.execute(sql`
    SELECT id, rate_card_id as "rateCardId",
           zone_name as "zoneName", geojson,
           multiplier::text as "multiplier",
           priority, is_active as "isActive"
    FROM delivery_rate_card_zones
    WHERE is_active = true
    ORDER BY rate_card_id ASC, priority ASC, id ASC
  `);

  const specialDays = await db.execute(sql`
    SELECT id, day::text as "day", name,
           multiplier::text as "multiplier",
           is_active as "isActive"
    FROM delivery_special_days
    WHERE is_active = true
    ORDER BY day ASC
  `);

  const demandLevels = await db.execute(sql`
    SELECT id, service_type::text as "serviceType",
           demand_level::text as "demandLevel",
           multiplier::text as "multiplier",
           is_active as "isActive"
    FROM delivery_demand_levels
    WHERE is_active = true
    ORDER BY service_type ASC, demand_level ASC
  `);

  return {
    cards: (cards as unknown as any[]).map(
      (r): RateCardRow => ({
        id: Number(r.id),
        name: String(r.name),
        serviceType: String(r.serviceType ?? "FOOD"),
        cityName: r.cityName != null ? String(r.cityName) : null,
        priority: Number(r.priority ?? 0),
        isActive: Boolean(r.isActive),
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      })
    ),
    slabs: (slabs as unknown as any[]).map(
      (s): DistanceSlabRow => ({
        id: Number(s.id),
        rateCardId: Number(s.rateCardId),
        minKm: n(s.minKm),
        maxKm: n(s.maxKm),
        baseFare: n(s.baseFare) ?? 0,
        perKmRate: n(s.perKmRate) ?? 0,
        priority: Number(s.priority ?? 0),
      })
    ),
    timeSlots: (timeSlots as unknown as any[]).map(
      (t): TimeSlotRow => ({
        id: Number(t.id),
        rateCardId: Number(t.rateCardId),
        startMin: Number(t.startMin),
        endMin: Number(t.endMin),
        surgeMultiplier: n(t.surgeMultiplier) ?? 1,
        isWeekendOnly: Boolean(t.isWeekendOnly),
      })
    ),
    zones: (zones as unknown as any[]).map(
      (z): ZoneRow => ({
        id: Number(z.id),
        rateCardId: Number(z.rateCardId),
        zoneName: z.zoneName != null ? String(z.zoneName) : null,
        geojson: z.geojson,
        multiplier: n(z.multiplier) ?? 1,
        priority: Number(z.priority ?? 0),
        isActive: Boolean(z.isActive),
      })
    ),
    specialDays: (specialDays as unknown as any[]).map(
      (d): SpecialDayRow => ({
        id: Number(d.id),
        day: String(d.day),
        name: d.name != null ? String(d.name) : null,
        multiplier: n(d.multiplier) ?? 1,
        isActive: Boolean(d.isActive),
      })
    ),
    demandLevels: (demandLevels as unknown as any[]).map(
      (d): DemandLevelRow => ({
        id: Number(d.id),
        serviceType: String(d.serviceType ?? "FOOD"),
        demandLevel: String(d.demandLevel ?? "UNKNOWN"),
        multiplier: n(d.multiplier) ?? 1,
        isActive: Boolean(d.isActive),
      })
    ),
  };
}


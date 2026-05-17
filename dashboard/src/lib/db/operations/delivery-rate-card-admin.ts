import { getSql } from "../client";
import { sqlJsonb } from "./billing-admin";

export type DeliveryRateCardAdminRow = {
  id: number;
  name: string;
  service_type: string;
  city_name: string | null;
  priority: number;
  is_active: boolean;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type DeliveryRateCardSlabInput = {
  min_km?: number | null;
  max_km?: number | null;
  base_fare?: number;
  per_km_rate?: number;
  priority?: number;
  metadata?: unknown;
};

export type DeliveryRateCardTimeSlotInput = {
  start_min: number;
  end_min: number;
  surge_multiplier?: number;
  is_weekend_only?: boolean;
  metadata?: unknown;
};

export type DeliveryRateCardZoneInput = {
  zone_name?: string | null;
  geojson: unknown;
  multiplier?: number;
  priority?: number;
  is_active?: boolean;
  metadata?: unknown;
};

export type DeliveryRateCardFull = DeliveryRateCardAdminRow & {
  slabs: Array<{ id: number; min_km: string | null; max_km: string | null; base_fare: string; per_km_rate: string; priority: number; metadata: unknown }>;
  time_slots: Array<{ id: number; start_min: number; end_min: number; surge_multiplier: string; is_weekend_only: boolean; metadata: unknown }>;
  zones: Array<{ id: number; zone_name: string | null; geojson: unknown; multiplier: string; priority: number; is_active: boolean; metadata: unknown }>;
};

export async function listDeliveryRateCards(serviceType?: string): Promise<DeliveryRateCardAdminRow[]> {
  const sql = getSql();
  const st = serviceType?.trim().toUpperCase();
  if (st) {
    return sql<DeliveryRateCardAdminRow[]>`
      SELECT id, name, service_type, city_name, priority, is_active, metadata,
             created_at::text as created_at, updated_at::text as updated_at
      FROM delivery_rate_cards
      WHERE service_type = ${st} OR service_type = 'ALL'
      ORDER BY priority ASC, id ASC
    `;
  }
  return sql<DeliveryRateCardAdminRow[]>`
    SELECT id, name, service_type, city_name, priority, is_active, metadata,
           created_at::text as created_at, updated_at::text as updated_at
    FROM delivery_rate_cards
    ORDER BY priority ASC, id ASC
  `;
}

export async function getDeliveryRateCardFull(id: number): Promise<DeliveryRateCardFull | null> {
  const sql = getSql();
  const [card] = await sql<DeliveryRateCardAdminRow[]>`
    SELECT id, name, service_type, city_name, priority, is_active, metadata,
           created_at::text as created_at, updated_at::text as updated_at
    FROM delivery_rate_cards
    WHERE id = ${id}
    LIMIT 1
  `;
  if (!card) return null;
  const slabs = await sql`
    SELECT id,
      min_km::text as min_km, max_km::text as max_km,
      base_fare::text as base_fare, per_km_rate::text as per_km_rate,
      priority, metadata
    FROM delivery_rate_card_distance_slabs
    WHERE rate_card_id = ${id}
    ORDER BY priority ASC, id ASC
  `;
  const time_slots = await sql`
    SELECT id, start_min, end_min,
      surge_multiplier::text as surge_multiplier,
      is_weekend_only, metadata
    FROM delivery_rate_card_time_slots
    WHERE rate_card_id = ${id}
    ORDER BY id ASC
  `;
  const zones = await sql`
    SELECT id, zone_name, geojson,
      multiplier::text as multiplier,
      priority, is_active, metadata
    FROM delivery_rate_card_zones
    WHERE rate_card_id = ${id}
    ORDER BY priority ASC, id ASC
  `;
  return { ...card, slabs: slabs as any, time_slots: time_slots as any, zones: zones as any };
}

export type UpsertDeliveryRateCardInput = {
  name: string;
  service_type: string;
  city_name?: string | null;
  priority?: number;
  is_active?: boolean;
  metadata?: unknown;
  slabs?: DeliveryRateCardSlabInput[];
  time_slots?: DeliveryRateCardTimeSlotInput[];
  zones?: DeliveryRateCardZoneInput[];
};

export async function insertDeliveryRateCardFull(input: UpsertDeliveryRateCardInput): Promise<number> {
  const sql = getSql();
  const st = input.service_type.trim().toUpperCase();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO delivery_rate_cards (name, service_type, city_name, priority, is_active, metadata)
    VALUES (${input.name}, ${st}, ${input.city_name ?? null}, ${input.priority ?? 0}, ${input.is_active ?? true}, ${sqlJsonb(input.metadata)}::jsonb)
    RETURNING id
  `;
  if (!row) throw new Error("Insert failed");
  await replaceChildren(row.id, input);
  return row.id;
}

export async function updateDeliveryRateCardFull(id: number, input: UpsertDeliveryRateCardInput): Promise<void> {
  const sql = getSql();
  const st = input.service_type.trim().toUpperCase();
  await sql`
    UPDATE delivery_rate_cards
    SET name = ${input.name},
        service_type = ${st},
        city_name = ${input.city_name ?? null},
        priority = ${input.priority ?? 0},
        is_active = ${input.is_active ?? true},
        metadata = ${sqlJsonb(input.metadata)}::jsonb,
        updated_at = now()
    WHERE id = ${id}
  `;
  await replaceChildren(id, input);
}

async function replaceChildren(id: number, input: UpsertDeliveryRateCardInput): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM delivery_rate_card_distance_slabs WHERE rate_card_id = ${id}`;
  await sql`DELETE FROM delivery_rate_card_time_slots WHERE rate_card_id = ${id}`;
  await sql`DELETE FROM delivery_rate_card_zones WHERE rate_card_id = ${id}`;

  const slabs = input.slabs ?? [];
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i]!;
    await sql`
      INSERT INTO delivery_rate_card_distance_slabs (rate_card_id, min_km, max_km, base_fare, per_km_rate, priority, metadata)
      VALUES (${id}, ${s.min_km ?? null}, ${s.max_km ?? null}, ${s.base_fare ?? 0}, ${s.per_km_rate ?? 0}, ${s.priority ?? i}, ${sqlJsonb(s.metadata)}::jsonb)
    `;
  }

  const timeSlots = input.time_slots ?? [];
  for (const t of timeSlots) {
    await sql`
      INSERT INTO delivery_rate_card_time_slots (rate_card_id, start_min, end_min, surge_multiplier, is_weekend_only, metadata)
      VALUES (${id}, ${t.start_min}, ${t.end_min}, ${t.surge_multiplier ?? 1}, ${t.is_weekend_only ?? false}, ${sqlJsonb(t.metadata)}::jsonb)
    `;
  }

  const zones = input.zones ?? [];
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]!;
    await sql`
      INSERT INTO delivery_rate_card_zones (rate_card_id, zone_name, geojson, multiplier, priority, is_active, metadata)
      VALUES (${id}, ${z.zone_name ?? null}, ${sqlJsonb(z.geojson)}::jsonb, ${z.multiplier ?? 1}, ${z.priority ?? i}, ${z.is_active ?? true}, ${sqlJsonb(z.metadata)}::jsonb)
    `;
  }
}

export async function deleteDeliveryRateCard(id: number): Promise<boolean> {
  const sql = getSql();
  const res = await sql`DELETE FROM delivery_rate_cards WHERE id = ${id}`;
  return (res as { count: number }).count > 0;
}


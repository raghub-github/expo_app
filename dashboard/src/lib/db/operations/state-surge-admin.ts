import { getSql } from "../client";
import type {
  StateSurgeRow,
  StateSurgeSettings,
  StateSurgeTimeSlotRow,
  StateSurgeType,
  StateSurgeVehicleScope,
} from "@/lib/geo/ride-state-config-shared";
import { DEFAULT_STATE_SURGE_NAMES, STATE_SURGE_SEED_TIME_SLOTS } from "@/lib/geo/ride-state-config-shared";
import type { DefaultStateSurgeName } from "@/lib/geo/ride-state-config-shared";

export type {
  StateSurgeRow,
  StateSurgeTimeSlotRow,
  StateSurgeType,
  StateSurgeVehicleScope,
} from "@/lib/geo/ride-state-config-shared";

const DEFAULT_STATE_SURGE_TEMPLATES: Array<{
  name: (typeof DEFAULT_STATE_SURGE_NAMES)[number];
  description: string;
  priority: number;
}> = [
  {
    name: "Peak Hour Surge",
    description: "Auto-applies during configured peak time windows",
    priority: 100,
  },
  {
    name: "Rain Surge",
    description: "Manual rain surge — future weather API ready",
    priority: 90,
  },
  {
    name: "Festival Surge",
    description: "Manual festival / holiday surge",
    priority: 80,
  },
  {
    name: "Night Surge",
    description: "Night-time rider incentive (23:00–03:00 window by default)",
    priority: 70,
  },
];

async function insertSeedTimeSlotsForSurge(
  sql: ReturnType<typeof getSql>,
  surgeId: number,
  surgeName: DefaultStateSurgeName
) {
  const slots = STATE_SURGE_SEED_TIME_SLOTS[surgeName] ?? [];
  for (const slot of slots) {
    await sql`
      INSERT INTO state_surge_time_slots (state_surge_id, start_time, end_time, days_of_week, is_enabled)
      VALUES (
        ${surgeId},
        ${slot.startTime}::time,
        ${slot.endTime}::time,
        ARRAY[0,1,2,3,4,5,6]::smallint[],
        true
      )
    `;
  }
}

function mapSurge(r: Record<string, unknown>): StateSurgeRow {
  return {
    id: Number(r.id),
    stateId: String(r.state_id),
    name: String(r.name),
    description: r.description == null ? null : String(r.description),
    enabled: r.enabled === true,
    surgeType: String(r.surge_type) as StateSurgeType,
    amount: Number(r.amount),
    vehicleType: String(r.vehicle_type) as StateSurgeVehicleScope,
    appliesFood: r.applies_food !== false,
    appliesParcel: r.applies_parcel !== false,
    appliesRide: r.applies_ride !== false,
    maxRidersOnly: r.max_riders_only === true,
    priority: Number(r.priority ?? 100),
    manualActive: r.manual_active === true,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapSlot(r: Record<string, unknown>): StateSurgeTimeSlotRow {
  const days = r.days_of_week;
  return {
    id: Number(r.id),
    stateSurgeId: Number(r.state_surge_id),
    startTime: String(r.start_time).slice(0, 5),
    endTime: String(r.end_time).slice(0, 5),
    daysOfWeek: Array.isArray(days) ? days.map((d) => Number(d)) : [0, 1, 2, 3, 4, 5, 6],
    isEnabled: r.is_enabled === true,
  };
}

export async function listStateSurges(stateId: string): Promise<StateSurgeRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM state_surge_configs
    WHERE state_id = ${stateId}::uuid AND deleted_at IS NULL
    ORDER BY priority DESC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapSurge(r as Record<string, unknown>));
}

/** Create settings table if migrations have not been applied yet. */
export async function ensureStateSurgeSettingsSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS state_surge_settings (
      state_id uuid PRIMARY KEY,
      max_total_surge_amount numeric(12, 2) NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT state_surge_settings_state_fk FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE,
      CONSTRAINT state_surge_settings_max_nonneg CHECK (
        max_total_surge_amount IS NULL OR max_total_surge_amount >= 0
      )
    )
  `;
}

export async function listStateSurgeTimeSlotsForState(stateId: string): Promise<StateSurgeTimeSlotRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT ts.*
    FROM state_surge_time_slots ts
    INNER JOIN state_surge_configs sc ON sc.id = ts.state_surge_id
    WHERE sc.state_id = ${stateId}::uuid AND sc.deleted_at IS NULL
    ORDER BY ts.start_time ASC, ts.id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapSlot(r as Record<string, unknown>));
}

/** Seed the 4 built-in rider surges per state (disabled, ₹0) if missing. */
export async function ensureStateSurgeDefaults(stateId: string): Promise<void> {
  const sql = getSql();
  const existing = await sql<{ name: string }[]>`
    SELECT name FROM state_surge_configs
    WHERE state_id = ${stateId}::uuid AND deleted_at IS NULL
  `;
  const existingNames = new Set(existing.map((r) => String(r.name).trim()));

  for (const template of DEFAULT_STATE_SURGE_TEMPLATES) {
    if (existingNames.has(template.name)) continue;

    const inserted = await sql`
      INSERT INTO state_surge_configs (
        state_id, name, description, enabled, surge_type, amount,
        vehicle_type, applies_food, applies_parcel, applies_ride,
        max_riders_only, priority, manual_active
      ) VALUES (
        ${stateId}::uuid, ${template.name}, ${template.description},
        false, 'fixed'::state_surge_type, 0,
        'all'::state_surge_vehicle_scope, true, true, true,
        false, ${template.priority}, false
      )
      RETURNING id
    `;
    const surgeId = Number((inserted[0] as { id: number }).id);
    const seedSlots = STATE_SURGE_SEED_TIME_SLOTS[template.name] ?? [];
    if (seedSlots.length > 0) {
      await insertSeedTimeSlotsForSurge(sql, surgeId, template.name);
    }
  }
}

/** Backfill time-slot rows from seed catalog when a surge has none (per state). */
export async function ensureStateSurgeTimeSlots(stateId: string): Promise<void> {
  const sql = getSql();
  const surges = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM state_surge_configs
    WHERE state_id = ${stateId}::uuid AND deleted_at IS NULL
  `;

  for (const surge of surges) {
    const name = String(surge.name).trim() as DefaultStateSurgeName;
    const seedSlots = STATE_SURGE_SEED_TIME_SLOTS[name];
    if (!seedSlots?.length) continue;

    const existing = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM state_surge_time_slots WHERE state_surge_id = ${surge.id}
    `;
    if ((existing[0]?.n ?? 0) > 0) continue;

    await insertSeedTimeSlotsForSurge(sql, Number(surge.id), name);
  }
}

export async function assertUniqueStateSurgePriority(
  stateId: string,
  priority: number,
  excludeId?: number
): Promise<void> {
  const sql = getSql();
  const rows =
    excludeId != null
      ? await sql`
          SELECT id FROM state_surge_configs
          WHERE state_id = ${stateId}::uuid
            AND priority = ${priority}
            AND deleted_at IS NULL
            AND id <> ${excludeId}
          LIMIT 1
        `
      : await sql`
          SELECT id FROM state_surge_configs
          WHERE state_id = ${stateId}::uuid
            AND priority = ${priority}
            AND deleted_at IS NULL
          LIMIT 1
        `;
  if (rows.length > 0) {
    throw new Error(`Another surge already uses priority ${priority} in this state`);
  }
}

export async function insertStateSurge(args: {
  stateId: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  surgeType?: StateSurgeType;
  amount: number;
  vehicleType?: StateSurgeVehicleScope;
  appliesFood?: boolean;
  appliesParcel?: boolean;
  appliesRide?: boolean;
  maxRidersOnly?: boolean;
  priority?: number;
  manualActive?: boolean;
}): Promise<StateSurgeRow> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO state_surge_configs (
      state_id, name, description, enabled, surge_type, amount,
      vehicle_type, applies_food, applies_parcel, applies_ride,
      max_riders_only, priority, manual_active
    ) VALUES (
      ${args.stateId}::uuid, ${args.name}, ${args.description ?? null},
      ${args.enabled ?? true}, ${(args.surgeType ?? "fixed")}::state_surge_type, ${args.amount},
      ${(args.vehicleType ?? "all")}::state_surge_vehicle_scope,
      ${args.appliesFood ?? true}, ${args.appliesParcel ?? true}, ${args.appliesRide ?? true},
      ${args.maxRidersOnly ?? false}, ${args.priority ?? 100}, ${args.manualActive ?? false}
    )
    RETURNING *
  `;
  return mapSurge((rows as Record<string, unknown>[])[0]!);
}

export async function updateStateSurge(
  id: number,
  patch: Partial<{
    name: string;
    description: string | null;
    enabled: boolean;
    surgeType: StateSurgeType;
    amount: number;
    vehicleType: StateSurgeVehicleScope;
    appliesFood: boolean;
    appliesParcel: boolean;
    appliesRide: boolean;
    maxRidersOnly: boolean;
    priority: number;
    manualActive: boolean;
  }>
): Promise<StateSurgeRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE state_surge_configs SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      enabled = COALESCE($4, enabled),
      surge_type = COALESCE($5::state_surge_type, surge_type),
      amount = COALESCE($6, amount),
      vehicle_type = COALESCE($7::state_surge_vehicle_scope, vehicle_type),
      applies_food = COALESCE($8, applies_food),
      applies_parcel = COALESCE($9, applies_parcel),
      applies_ride = COALESCE($10, applies_ride),
      max_riders_only = COALESCE($11, max_riders_only),
      priority = COALESCE($12, priority),
      manual_active = COALESCE($13, manual_active),
      updated_at = now()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *`,
    [
      id,
      patch.name ?? null,
      patch.description ?? null,
      patch.enabled ?? null,
      patch.surgeType ?? null,
      patch.amount ?? null,
      patch.vehicleType ?? null,
      patch.appliesFood ?? null,
      patch.appliesParcel ?? null,
      patch.appliesRide ?? null,
      patch.maxRidersOnly ?? null,
      patch.priority ?? null,
      patch.manualActive ?? null,
    ]
  );
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapSurge(row) : null;
}

export async function deleteStateSurge(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    UPDATE state_surge_configs SET deleted_at = now(), updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL RETURNING id
  `;
  return rows.length > 0;
}

export async function listStateSurgeTimeSlots(stateSurgeId?: number): Promise<StateSurgeTimeSlotRow[]> {
  const sql = getSql();
  const rows =
    stateSurgeId != null
      ? await sql`SELECT * FROM state_surge_time_slots WHERE state_surge_id = ${stateSurgeId} ORDER BY start_time`
      : await sql`SELECT * FROM state_surge_time_slots ORDER BY state_surge_id, start_time`;
  return (Array.isArray(rows) ? rows : []).map((r) => mapSlot(r as Record<string, unknown>));
}

export async function insertStateSurgeTimeSlot(args: {
  stateSurgeId: number;
  startTime: string;
  endTime: string;
  daysOfWeek?: number[];
  isEnabled?: boolean;
}): Promise<StateSurgeTimeSlotRow> {
  const sql = getSql();
  const days = args.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
  const rows = await sql`
    INSERT INTO state_surge_time_slots (state_surge_id, start_time, end_time, days_of_week, is_enabled)
    VALUES (${args.stateSurgeId}, ${args.startTime}::time, ${args.endTime}::time, ${days}, ${args.isEnabled ?? true})
    RETURNING *
  `;
  return mapSlot((rows as Record<string, unknown>[])[0]!);
}

export async function updateStateSurgeTimeSlot(
  id: number,
  patch: Partial<{ startTime: string; endTime: string; daysOfWeek: number[]; isEnabled: boolean }>
): Promise<StateSurgeTimeSlotRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE state_surge_time_slots SET
      start_time = COALESCE($2::time, start_time),
      end_time = COALESCE($3::time, end_time),
      days_of_week = COALESCE($4, days_of_week),
      is_enabled = COALESCE($5, is_enabled),
      updated_at = now()
    WHERE id = $1 RETURNING *`,
    [id, patch.startTime ?? null, patch.endTime ?? null, patch.daysOfWeek ?? null, patch.isEnabled ?? null]
  );
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapSlot(row) : null;
}

export async function deleteStateSurgeTimeSlot(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`DELETE FROM state_surge_time_slots WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function loadStateSurgeCatalog(stateId: string) {
  await ensureStateSurgeSettingsSchema();
  const [surges, timeSlots, settings] = await Promise.all([
    listStateSurges(stateId),
    listStateSurgeTimeSlotsForState(stateId),
    loadStateSurgeSettings(stateId),
  ]);
  return { surges, timeSlots, settings };
}

export async function loadStateSurgeSettings(stateId: string): Promise<StateSurgeSettings> {
  const sql = getSql();
  const rows = await sql`
    SELECT state_id::text AS state_id, max_total_surge_amount
    FROM state_surge_settings
    WHERE state_id = ${stateId}::uuid
    LIMIT 1
  `;
  const row = rows[0] as { state_id?: string; max_total_surge_amount?: unknown } | undefined;
  return {
    stateId,
    maxTotalSurgeAmount:
      row?.max_total_surge_amount == null ? null : Number(row.max_total_surge_amount),
  };
}

export async function upsertStateSurgeSettings(args: {
  stateId: string;
  maxTotalSurgeAmount: number | null;
}): Promise<StateSurgeSettings> {
  await ensureStateSurgeSettingsSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO state_surge_settings (state_id, max_total_surge_amount)
    VALUES (${args.stateId}::uuid, ${args.maxTotalSurgeAmount})
    ON CONFLICT (state_id) DO UPDATE SET
      max_total_surge_amount = EXCLUDED.max_total_surge_amount,
      updated_at = now()
    RETURNING state_id::text AS state_id, max_total_surge_amount
  `;
  const row = rows[0] as { state_id: string; max_total_surge_amount: unknown };
  return {
    stateId: String(row.state_id),
    maxTotalSurgeAmount:
      row.max_total_surge_amount == null ? null : Number(row.max_total_surge_amount),
  };
}

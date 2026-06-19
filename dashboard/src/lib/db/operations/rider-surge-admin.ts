import { getSql } from "../client";

export type RiderSurgeKind = "peak_hour" | "rain" | "festival" | "custom";

export type SurgeDefinitionRow = {
  id: number;
  name: string;
  description: string | null;
  kind: RiderSurgeKind;
  fixedAmount: number;
  priority: number;
  isEnabled: boolean;
  gmitraMaxOnly: boolean;
  appliesFood: boolean;
  appliesParcel: boolean;
  appliesRide: boolean;
  vehicle2Wheeler: boolean;
  vehicle3Wheeler: boolean;
  vehicle4WheelerAc: boolean;
  vehicle4WheelerNonAc: boolean;
  manualActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SurgeTimeSlotRow = {
  id: number;
  surgeId: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SurgeSettingsRow = {
  maxTotalSurgeAmount: number | null;
  surgeWaitMaxOnly: boolean;
  updatedAt: string;
};

function mapDefinition(r: Record<string, unknown>): SurgeDefinitionRow {
  return {
    id: Number(r.id),
    name: String(r.name),
    description: r.description == null ? null : String(r.description),
    kind: String(r.kind) as RiderSurgeKind,
    fixedAmount: Number(r.fixed_amount),
    priority: Number(r.priority ?? 100),
    isEnabled: r.is_enabled === true,
    gmitraMaxOnly: r.gmitra_max_only === true,
    appliesFood: r.applies_food === true,
    appliesParcel: r.applies_parcel === true,
    appliesRide: r.applies_ride === true,
    vehicle2Wheeler: r.vehicle_2_wheeler !== false,
    vehicle3Wheeler: r.vehicle_3_wheeler === true,
    vehicle4WheelerAc: r.vehicle_4_wheeler_ac === true,
    vehicle4WheelerNonAc: r.vehicle_4_wheeler_non_ac === true,
    manualActive: r.manual_active === true,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapTimeSlot(r: Record<string, unknown>): SurgeTimeSlotRow {
  const days = r.days_of_week;
  return {
    id: Number(r.id),
    surgeId: Number(r.surge_id),
    startTime: String(r.start_time).slice(0, 5),
    endTime: String(r.end_time).slice(0, 5),
    daysOfWeek: Array.isArray(days) ? days.map((d) => Number(d)) : [0, 1, 2, 3, 4, 5, 6],
    isEnabled: r.is_enabled === true,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function getSurgeSettings(): Promise<SurgeSettingsRow> {
  const sql = getSql();
  const rows = await sql`
    SELECT max_total_surge_amount, surge_wait_max_only, updated_at
    FROM surge_settings WHERE id = 1 LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return {
    maxTotalSurgeAmount:
      row?.max_total_surge_amount == null ? null : Number(row.max_total_surge_amount),
    surgeWaitMaxOnly: row?.surge_wait_max_only === true,
    updatedAt: String(row?.updated_at ?? new Date().toISOString()),
  };
}

export async function updateSurgeSettings(patch: {
  maxTotalSurgeAmount?: number | null;
  surgeWaitMaxOnly?: boolean;
}): Promise<SurgeSettingsRow> {
  const sql = getSql();
  const rows = await sql`
    UPDATE surge_settings SET
      max_total_surge_amount = COALESCE(${patch.maxTotalSurgeAmount ?? null}, max_total_surge_amount),
      surge_wait_max_only = COALESCE(${patch.surgeWaitMaxOnly ?? null}, surge_wait_max_only),
      updated_at = now()
    WHERE id = 1
    RETURNING max_total_surge_amount, surge_wait_max_only, updated_at
  `;
  const row = rows[0] as Record<string, unknown>;
  return {
    maxTotalSurgeAmount:
      row.max_total_surge_amount == null ? null : Number(row.max_total_surge_amount),
    surgeWaitMaxOnly: row.surge_wait_max_only === true,
    updatedAt: String(row.updated_at),
  };
}

export async function listSurgeDefinitions(): Promise<SurgeDefinitionRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM surge_definitions
    WHERE deleted_at IS NULL
    ORDER BY priority DESC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapDefinition(r as Record<string, unknown>));
}

export async function getSurgeDefinition(id: number): Promise<SurgeDefinitionRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM surge_definitions WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapDefinition(row) : null;
}

export async function insertSurgeDefinition(args: {
  name: string;
  description?: string | null;
  kind?: RiderSurgeKind;
  fixedAmount: number;
  priority?: number;
  isEnabled?: boolean;
  gmitraMaxOnly?: boolean;
  appliesFood?: boolean;
  appliesParcel?: boolean;
  appliesRide?: boolean;
  vehicle2Wheeler?: boolean;
  vehicle3Wheeler?: boolean;
  vehicle4WheelerAc?: boolean;
  vehicle4WheelerNonAc?: boolean;
  manualActive?: boolean;
}): Promise<SurgeDefinitionRow> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO surge_definitions (
      name, description, kind, fixed_amount, priority, is_enabled, gmitra_max_only,
      applies_food, applies_parcel, applies_ride,
      vehicle_2_wheeler, vehicle_3_wheeler, vehicle_4_wheeler_ac, vehicle_4_wheeler_non_ac,
      manual_active
    ) VALUES (
      ${args.name},
      ${args.description ?? null},
      ${(args.kind ?? "custom")}::rider_surge_kind,
      ${args.fixedAmount},
      ${args.priority ?? 100},
      ${args.isEnabled ?? true},
      ${args.gmitraMaxOnly ?? false},
      ${args.appliesFood ?? false},
      ${args.appliesParcel ?? false},
      ${args.appliesRide ?? false},
      ${args.vehicle2Wheeler ?? true},
      ${args.vehicle3Wheeler ?? false},
      ${args.vehicle4WheelerAc ?? false},
      ${args.vehicle4WheelerNonAc ?? false},
      ${args.manualActive ?? false}
    )
    RETURNING *
  `;
  return mapDefinition((rows as Record<string, unknown>[])[0]!);
}

export async function updateSurgeDefinition(
  id: number,
  patch: Partial<{
    name: string;
    description: string | null;
    kind: RiderSurgeKind;
    fixedAmount: number;
    priority: number;
    isEnabled: boolean;
    gmitraMaxOnly: boolean;
    appliesFood: boolean;
    appliesParcel: boolean;
    appliesRide: boolean;
    vehicle2Wheeler: boolean;
    vehicle3Wheeler: boolean;
    vehicle4WheelerAc: boolean;
    vehicle4WheelerNonAc: boolean;
    manualActive: boolean;
  }>
): Promise<SurgeDefinitionRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE surge_definitions SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      kind = COALESCE($4::rider_surge_kind, kind),
      fixed_amount = COALESCE($5, fixed_amount),
      priority = COALESCE($6, priority),
      is_enabled = COALESCE($7, is_enabled),
      gmitra_max_only = COALESCE($8, gmitra_max_only),
      applies_food = COALESCE($9, applies_food),
      applies_parcel = COALESCE($10, applies_parcel),
      applies_ride = COALESCE($11, applies_ride),
      vehicle_2_wheeler = COALESCE($12, vehicle_2_wheeler),
      vehicle_3_wheeler = COALESCE($13, vehicle_3_wheeler),
      vehicle_4_wheeler_ac = COALESCE($14, vehicle_4_wheeler_ac),
      vehicle_4_wheeler_non_ac = COALESCE($15, vehicle_4_wheeler_non_ac),
      manual_active = COALESCE($16, manual_active),
      updated_at = now()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *`,
    [
      id,
      patch.name ?? null,
      patch.description ?? null,
      patch.kind ?? null,
      patch.fixedAmount ?? null,
      patch.priority ?? null,
      patch.isEnabled ?? null,
      patch.gmitraMaxOnly ?? null,
      patch.appliesFood ?? null,
      patch.appliesParcel ?? null,
      patch.appliesRide ?? null,
      patch.vehicle2Wheeler ?? null,
      patch.vehicle3Wheeler ?? null,
      patch.vehicle4WheelerAc ?? null,
      patch.vehicle4WheelerNonAc ?? null,
      patch.manualActive ?? null,
    ]
  );
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapDefinition(row) : null;
}

export async function deleteSurgeDefinition(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    UPDATE surge_definitions SET deleted_at = now(), updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function listSurgeTimeSlots(surgeId?: number): Promise<SurgeTimeSlotRow[]> {
  const sql = getSql();
  const rows =
    surgeId != null
      ? await sql`
          SELECT * FROM surge_time_slots WHERE surge_id = ${surgeId}
          ORDER BY start_time ASC, id ASC
        `
      : await sql`
          SELECT * FROM surge_time_slots ORDER BY surge_id ASC, start_time ASC, id ASC
        `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapTimeSlot(r as Record<string, unknown>));
}

export async function insertSurgeTimeSlot(args: {
  surgeId: number;
  startTime: string;
  endTime: string;
  daysOfWeek?: number[];
  isEnabled?: boolean;
}): Promise<SurgeTimeSlotRow> {
  const sql = getSql();
  const days = args.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
  const rows = await sql`
    INSERT INTO surge_time_slots (surge_id, start_time, end_time, days_of_week, is_enabled)
    VALUES (${args.surgeId}, ${args.startTime}::time, ${args.endTime}::time, ${days}, ${args.isEnabled ?? true})
    RETURNING *
  `;
  return mapTimeSlot((rows as Record<string, unknown>[])[0]!);
}

export async function updateSurgeTimeSlot(
  id: number,
  patch: Partial<{
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
    isEnabled: boolean;
  }>
): Promise<SurgeTimeSlotRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE surge_time_slots SET
      start_time = COALESCE($2::time, start_time),
      end_time = COALESCE($3::time, end_time),
      days_of_week = COALESCE($4, days_of_week),
      is_enabled = COALESCE($5, is_enabled),
      updated_at = now()
    WHERE id = $1
    RETURNING *`,
    [
      id,
      patch.startTime ?? null,
      patch.endTime ?? null,
      patch.daysOfWeek ?? null,
      patch.isEnabled ?? null,
    ]
  );
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapTimeSlot(row) : null;
}

export async function deleteSurgeTimeSlot(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`DELETE FROM surge_time_slots WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function loadSurgeCatalog() {
  const [settings, definitions, timeSlots] = await Promise.all([
    getSurgeSettings(),
    listSurgeDefinitions(),
    listSurgeTimeSlots(),
  ]);
  return { settings, definitions, timeSlots };
}

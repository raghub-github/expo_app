import { getSql } from "../../db/client.js";
import type {
  SurgeDefinitionRow,
  SurgeSettingsRow,
  SurgeTimeSlotRow,
} from "./types.js";

function mapDefinition(r: Record<string, unknown>): SurgeDefinitionRow {
  return {
    id: Number(r.id),
    name: String(r.name),
    description: r.description == null ? null : String(r.description),
    kind: String(r.kind) as SurgeDefinitionRow["kind"],
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
  };
}

export async function loadSurgeSettings(): Promise<SurgeSettingsRow> {
  const sql = getSql();
  const rows = await sql`
    SELECT max_total_surge_amount, surge_wait_max_only
    FROM surge_settings WHERE id = 1 LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return {
    maxTotalSurgeAmount:
      row?.max_total_surge_amount == null ? null : Number(row.max_total_surge_amount),
    surgeWaitMaxOnly: row?.surge_wait_max_only === true,
  };
}

export async function loadActiveSurgeDefinitions(): Promise<SurgeDefinitionRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM surge_definitions
    WHERE deleted_at IS NULL
    ORDER BY priority DESC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) =>
    mapDefinition(r as Record<string, unknown>)
  );
}

export async function loadSurgeTimeSlots(): Promise<SurgeTimeSlotRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM surge_time_slots ORDER BY surge_id ASC, start_time ASC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) =>
    mapTimeSlot(r as Record<string, unknown>)
  );
}

export async function loadSurgeCatalog(): Promise<{
  settings: SurgeSettingsRow;
  definitions: SurgeDefinitionRow[];
  timeSlots: SurgeTimeSlotRow[];
}> {
  const [settings, definitions, timeSlots] = await Promise.all([
    loadSurgeSettings(),
    loadActiveSurgeDefinitions(),
    loadSurgeTimeSlots(),
  ]);
  return { settings, definitions, timeSlots };
}

export function groupTimeSlotsBySurgeId(
  slots: SurgeTimeSlotRow[]
): Map<number, SurgeTimeSlotRow[]> {
  const map = new Map<number, SurgeTimeSlotRow[]>();
  for (const slot of slots) {
    const list = map.get(slot.surgeId) ?? [];
    list.push(slot);
    map.set(slot.surgeId, list);
  }
  return map;
}

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { dutyLogs, riderVehicles } from "../db/schema.js";

export type RiderDutyLogStatus = "ON" | "OFF" | "AUTO_OFF";
export type RiderDutyService = "food" | "parcel" | "person_ride";

export type RecordRiderDutyLogInput = {
  riderId: number;
  status: RiderDutyLogStatus;
  serviceTypes?: RiderDutyService[];
  source?: "rider_app" | "system" | "dashboard";
  deviceId?: string | null;
  lat?: number | null;
  lon?: number | null;
  vehicleId?: number | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
};

async function resolveActiveVehicleId(riderId: number): Promise<number | null> {
  const db = getDb();
  const [vehicle] = await db
    .select({ id: riderVehicles.id })
    .from(riderVehicles)
    .where(eq(riderVehicles.riderId, riderId))
    .orderBy(desc(riderVehicles.updatedAt))
    .limit(1);
  return vehicle?.id ?? null;
}

export async function getLatestDutyLog(riderId: number) {
  const db = getDb();
  const [row] = await db
    .select({
      status: dutyLogs.status,
      serviceTypes: dutyLogs.serviceTypes,
      timestamp: dutyLogs.timestamp,
      sessionId: dutyLogs.sessionId,
    })
    .from(dutyLogs)
    .where(eq(dutyLogs.riderId, riderId))
    .orderBy(desc(dutyLogs.timestamp))
    .limit(1);
  return row ?? null;
}

/** Append an immutable duty_logs row (dashboard Activity Logs source of truth). */
export async function recordRiderDutyLog(input: RecordRiderDutyLogInput): Promise<void> {
  const db = getDb();
  const serviceTypes = input.status === "ON" ? (input.serviceTypes ?? []) : [];
  const latest = await getLatestDutyLog(input.riderId);

  const sameStatus =
    latest?.status === input.status &&
    JSON.stringify(latest.serviceTypes ?? []) === JSON.stringify(serviceTypes);
  if (sameStatus) return;

  let sessionId = input.sessionId ?? null;
  if (input.status === "ON") {
    sessionId = sessionId ?? randomUUID();
  } else if (!sessionId && latest?.status === "ON" && latest.sessionId) {
    sessionId = latest.sessionId;
  }

  const vehicleId =
    input.vehicleId ?? (input.status === "ON" ? await resolveActiveVehicleId(input.riderId) : null);

  await db.insert(dutyLogs).values({
    riderId: input.riderId,
    status: input.status,
    serviceTypes,
    vehicleId,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    sessionId,
    deviceId: input.deviceId ?? null,
    metadata: {
      source: input.source ?? "rider_app",
      ...(input.metadata ?? {}),
    },
    timestamp: new Date(),
  });
}

export async function recordRiderDutyOffIfOnline(
  riderId: number,
  reason: "logout" | "restriction" | "manual",
  extra?: Omit<RecordRiderDutyLogInput, "riderId" | "status" | "serviceTypes">
): Promise<void> {
  const latest = await getLatestDutyLog(riderId);
  if (latest?.status !== "ON") return;

  await recordRiderDutyLog({
    riderId,
    status: reason === "restriction" ? "AUTO_OFF" : "OFF",
    serviceTypes: [],
    source: reason === "restriction" ? "system" : "rider_app",
    ...extra,
    metadata: {
      offReason: reason,
      ...(extra?.metadata ?? {}),
    },
  });
}

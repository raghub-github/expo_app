import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "../db/client.js";

import { riderVehicles } from "../db/schema.js";

import {
  mapFuelTypeFromDb,
  mapFuelTypeToDb,
  mapVehicleTypeFromDb,
  mapVehicleTypeToDb,
} from "./rider-vehicle-db-map.js";



function extractPgError(error: unknown): { message: string; detail?: string } {
  const parts: string[] = [];
  let detail: string | undefined;

  const visit = (err: unknown, depth = 0) => {
    if (!err || depth > 4) return;
    if (err instanceof Error) {
      if (err.message) parts.push(err.message);
      const c = (err as { cause?: unknown }).cause;
      if (c && typeof c === "object") {
        const pg = c as { message?: string; detail?: string };
        if (pg.message) parts.push(pg.message);
        if (pg.detail?.trim()) detail = pg.detail.trim();
      }
      visit(c, depth + 1);
    } else if (typeof err === "object") {
      const pg = err as { message?: string; detail?: string };
      if (pg.message) parts.push(pg.message);
      if (pg.detail?.trim()) detail = pg.detail.trim();
    }
  };

  visit(error);
  return { message: parts.join(" "), detail };
}

export function parseVehicleDbError(error: unknown): string {
  const { message, detail } = extractPgError(error);
  if (detail) return detail;

  if (/relation .+ does not exist/i.test(message)) {
    if (/rider_vehicles/i.test(message)) {
      return "Vehicle database schema is out of date. Run backend migrations.";
    }
  }



  if (/invalid input value for enum/i.test(message)) {

    if (/fuel_type/i.test(message)) return "Invalid fuel type selected";

    if (/vehicle_type/i.test(message)) return "Invalid vehicle type selected";

    if (/ac_type/i.test(message)) return "Invalid AC type selected";

    return "Invalid vehicle data";

  }

  if (/duplicate key|unique constraint/i.test(message)) {

    return "A vehicle record already exists for this rider";

  }

  if (/column .+ does not exist/i.test(message)) {

    return "Vehicle database schema is out of date. Contact support.";

  }

  if (message.includes("Failed query:")) {

    const short = message.split("\n").find((line) => line.trim() && !line.includes("Failed query"));

    if (short) return short.replace(/^error:\s*/i, "").trim();

  }

  return "Could not save vehicle. Please try again.";

}



const VEHICLE_TYPE_LABELS: Record<string, string> = {

  bike: "Bike",

  ev_bike: "EV Bike",

  cycle: "Bicycle",

  car: "Car",

  auto: "Auto",

  cng_auto: "CNG Auto",

  ev_auto: "EV Auto",

  taxi: "Taxi",

  e_rickshaw: "E-Rickshaw",

  ev_car: "EV Car",

  other: "Other",

};



const FUEL_TYPE_LABELS: Record<string, string> = {

  petrol: "Petrol",

  diesel: "Diesel",

  cng: "CNG",

  electric: "Electric",

  hybrid: "Hybrid",

};



const VALID_VEHICLE_TYPES = new Set(Object.keys(VEHICLE_TYPE_LABELS));

const VALID_FUEL_TYPES = new Set(Object.keys(FUEL_TYPE_LABELS));

const VALID_SERVICE_TYPES = ["food", "parcel", "person_ride"] as const;

const VALID_OWNERSHIP_TYPES = new Set(["ownership", "rental", "authorization_letter"]);

const VALID_AC_TYPES = new Set(["AC", "Non-AC"]);



export type RiderVehicleAppDto = {

  id: number;

  vehicleType: string;

  vehicleTypeLabel: string;

  registrationNumber: string;

  fuelType: string | null;

  fuelTypeLabel: string | null;

  make: string | null;

  model: string | null;

  year: number | null;

  color: string | null;

  ownershipType: string | null;

  registrationState: string | null;

  verified: boolean;

  isCommercial: boolean;

  serviceTypes: string[];

  seatingCapacity: number | null;

  acType: string | null;

};



export type RiderVehicleStatusResponse = {

  hasVehicle: boolean;

  isComplete: boolean;

  vehicle: RiderVehicleAppDto | null;

};



export type UpsertRiderVehicleInput = {

  vehicleType: string;

  registrationNumber: string;

  fuelType?: string | null;

  make?: string | null;

  model?: string | null;

  year?: number | null;

  color?: string | null;

  ownershipType?: string | null;

  registrationState?: string | null;

  serviceTypes?: string[];

  isCommercial?: boolean;

  seatingCapacity?: number | null;

  acType?: string | null;

};



function normalizeRegistrationNumber(value: string): string {

  return value.trim().toUpperCase().replace(/\s+/g, "");

}



export function deriveRegistrationStateFromPlate(registrationNumber: string): string | null {

  const reg = normalizeRegistrationNumber(registrationNumber);

  const match = reg.match(/^([A-Z]{2})/);

  return match ? match[1] : null;

}



function normalizeServiceTypes(raw: string[] | undefined): string[] {

  if (!raw?.length) return [];

  if (raw.includes("all")) {

    return [...VALID_SERVICE_TYPES];

  }

  return VALID_SERVICE_TYPES.filter((v) => raw.includes(v));

}



function rowToDto(row: typeof riderVehicles.$inferSelect): RiderVehicleAppDto {

  const vehicleType = mapVehicleTypeFromDb(String(row.vehicleType));

  const fuelType = mapFuelTypeFromDb(row.fuelType ? String(row.fuelType) : null);

  const rawServices = row.serviceTypes;

  const serviceTypes = Array.isArray(rawServices)

    ? rawServices.filter((s): s is string => typeof s === "string")

    : [];



  const customOtherLabel =

    vehicleType === "other" && row.make?.trim() ? row.make.trim() : null;



  return {

    id: Number(row.id),

    vehicleType,

    vehicleTypeLabel: customOtherLabel ?? VEHICLE_TYPE_LABELS[vehicleType] ?? vehicleType,

    registrationNumber: row.registrationNumber,

    fuelType,

    fuelTypeLabel: fuelType ? (FUEL_TYPE_LABELS[fuelType] ?? fuelType) : null,

    make: row.make,

    model: row.model,

    year: row.year,

    color: row.color,

    ownershipType: row.ownershipType,

    registrationState: row.registrationState,

    verified: Boolean(row.verified),

    isCommercial: Boolean(row.isCommercial),

    serviceTypes,

    seatingCapacity: row.seatingCapacity ?? null,

    acType: row.acType ? String(row.acType) : null,

  };

}



export function isRiderVehicleComplete(

  row: typeof riderVehicles.$inferSelect | null | undefined,

): boolean {

  if (!row) return false;

  const reg = normalizeRegistrationNumber(row.registrationNumber || "");

  if (reg.length < 4) return false;

  const vehicleType = mapVehicleTypeFromDb(String(row.vehicleType));

  if (!VALID_VEHICLE_TYPES.has(vehicleType)) return false;

  if (vehicleType === "other" && (row.make?.trim().length ?? 0) < 2) {

    return false;

  }



  const rawServices = row.serviceTypes;

  const serviceTypes = Array.isArray(rawServices)

    ? rawServices.filter((s): s is string => typeof s === "string")

    : [];

  if (serviceTypes.length < 1) return false;



  const ownership = row.ownershipType?.trim();

  if (!ownership || !VALID_OWNERSHIP_TYPES.has(ownership)) return false;



  return true;

}



export async function getActiveRiderVehicleRow(riderId: number) {

  const db = getDb();

  const [row] = await db

    .select()

    .from(riderVehicles)

    .where(

      and(

        eq(riderVehicles.riderId, riderId),

        eq(riderVehicles.isActive, true),

        isNull(riderVehicles.deletedAt),

      ),

    )

    .orderBy(desc(riderVehicles.updatedAt))

    .limit(1);



  if (row) return row;



  const [fallback] = await db

    .select()

    .from(riderVehicles)

    .where(and(eq(riderVehicles.riderId, riderId), isNull(riderVehicles.deletedAt)))

    .orderBy(desc(riderVehicles.updatedAt))

    .limit(1);



  return fallback ?? null;

}



export async function getRiderVehicleStatusForApp(

  riderId: number,

): Promise<RiderVehicleStatusResponse> {

  const row = await getActiveRiderVehicleRow(riderId);

  if (!row) {

    return { hasVehicle: false, isComplete: false, vehicle: null };

  }

  const vehicle = rowToDto(row);

  return {

    hasVehicle: true,

    isComplete: isRiderVehicleComplete(row),

    vehicle,

  };

}



export function validateUpsertRiderVehicleInput(

  input: UpsertRiderVehicleInput,

): { ok: true; data: Required<Pick<UpsertRiderVehicleInput, "vehicleType" | "registrationNumber">> & UpsertRiderVehicleInput & { serviceTypes: string[]; isCommercial: boolean; registrationState: string | null; vehicleNumber: string } } | { ok: false; error: string } {

  const vehicleType = input.vehicleType?.trim().toLowerCase();

  if (!vehicleType || !VALID_VEHICLE_TYPES.has(vehicleType)) {

    return { ok: false, error: "Invalid vehicle type" };

  }



  const registrationNumber = normalizeRegistrationNumber(input.registrationNumber || "");

  if (registrationNumber.length < 4) {

    return { ok: false, error: "Registration number is required (min 4 characters)" };

  }



  let fuelType: string | null | undefined = input.fuelType?.trim().toLowerCase() ?? null;

  if (fuelType === "") fuelType = null;

  if (fuelType && !VALID_FUEL_TYPES.has(fuelType)) {

    return { ok: false, error: "Invalid fuel type" };

  }



  const year =

    input.year == null || input.year === ("" as unknown as number)

      ? null

      : Number(input.year);

  if (year != null && (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear() + 1)) {

    return { ok: false, error: "Invalid year" };

  }



  const make = input.make?.trim() || null;

  if (vehicleType === "other" && (!make || make.length < 2)) {

    return { ok: false, error: "Please specify your vehicle type (min 2 characters)" };

  }



  const serviceTypes = normalizeServiceTypes(input.serviceTypes);

  if (serviceTypes.length < 1) {

    return { ok: false, error: "Select at least one service type" };

  }



  const ownershipType = input.ownershipType?.trim() || null;

  if (!ownershipType || !VALID_OWNERSHIP_TYPES.has(ownershipType)) {

    return { ok: false, error: "Select ownership type" };

  }



  const isCommercial = Boolean(input.isCommercial);



  const hasPersonRide = serviceTypes.includes("person_ride");



  let seatingCapacity: number | null =

    input.seatingCapacity == null || input.seatingCapacity === ("" as unknown as number)

      ? null

      : Number(input.seatingCapacity);

  if (!hasPersonRide) {

    seatingCapacity = null;

  } else if (seatingCapacity != null) {

    if (!Number.isInteger(seatingCapacity) || seatingCapacity < 1 || seatingCapacity > 50) {

      return { ok: false, error: "Invalid seating capacity" };

    }

  }



  let acType: string | null = input.acType?.trim() || null;

  if (!hasPersonRide) {

    acType = null;

  } else if (acType && !VALID_AC_TYPES.has(acType)) {

    return { ok: false, error: "Invalid AC type" };

  }



  const registrationState =

    input.registrationState?.trim() ||

    deriveRegistrationStateFromPlate(registrationNumber) ||

    null;



  return {

    ok: true,

    data: {

      vehicleType,

      registrationNumber,

      vehicleNumber: registrationNumber,

      fuelType: fuelType ?? null,

      make,

      model: input.model?.trim() || null,

      year,

      color: input.color?.trim() || null,

      ownershipType,

      registrationState,

      serviceTypes,

      isCommercial,

      seatingCapacity,

      acType,

    },

  };

}



// Discriminated-union extraction. The bare `extends … infer D` form doesn't
// distribute over the union returned by `validateUpsertRiderVehicleInput`
// (success | failure), so D collapsed to `never` and every property access
// below errored with TS2339 "Property X does not exist on type 'never'".
type PersistVehicleData = Extract<
  ReturnType<typeof validateUpsertRiderVehicleInput>,
  { ok: true }
>["data"];



async function persistRiderVehicleRow(
  riderId: number,
  data: PersistVehicleData,
  existingId: number | null,
): Promise<void> {
  const db = getDb();
  const now = new Date();

  const patch = {
    vehicleType: mapVehicleTypeToDb(data.vehicleType) as (typeof riderVehicles.$inferInsert)["vehicleType"],
    registrationNumber: data.registrationNumber,
    vehicleNumber: data.vehicleNumber,
    fuelType: mapFuelTypeToDb(data.fuelType) as (typeof riderVehicles.$inferInsert)["fuelType"],
    make: data.make,
    model: data.model,
    year: data.year,
    color: data.color,
    registrationState: data.registrationState,
    ownershipType: data.ownershipType,
    serviceTypes: data.serviceTypes,
    isCommercial: data.isCommercial,
    seatingCapacity: data.seatingCapacity,
    acType: (data.acType ?? null) as (typeof riderVehicles.$inferInsert)["acType"],
    vehicleActiveStatus: "active",
    isActive: true,
    updatedAt: now,
  };

  if (existingId != null) {
    await db
      .update(riderVehicles)
      .set(patch)
      .where(and(eq(riderVehicles.id, existingId), eq(riderVehicles.riderId, riderId)));
    return;
  }

  await db.insert(riderVehicles).values({
    riderId,
    ...patch,
    createdAt: now,
  });
}



export async function upsertRiderVehicleForApp(

  riderId: number,

  input: UpsertRiderVehicleInput,

): Promise<RiderVehicleStatusResponse> {

  const parsed = validateUpsertRiderVehicleInput(input);

  if (!parsed.ok) {

    throw new Error(parsed.error);

  }

  const data = parsed.data;

  const existing = await getActiveRiderVehicleRow(riderId);



  try {

    await persistRiderVehicleRow(riderId, data, existing ? Number(existing.id) : null);

  } catch (error) {

    throw new Error(parseVehicleDbError(error));

  }



  return getRiderVehicleStatusForApp(riderId);

}


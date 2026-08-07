import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb, getSql } from "../db/client.js";

import { riderVehicles } from "../db/schema.js";

import {
  mapFuelTypeFromDb,
  mapVehicleTypeFromDb,
  mapVehicleTypeToDb,
  resolveFuelTypeDbLabel,
  resolveVehicleCategoryDbLabel,
} from "./rider-vehicle-db-map.js";
import { normalizeOnboardingCategoryCode } from "./rider-vehicle-category-service-assignments.js";
import { filterDispatchServicesForRiderProfile } from "./rider-dispatch-service-rules.js";



function extractPgError(error: unknown): { message: string; detail?: string } {
  const parts: string[] = [];
  let detail: string | undefined;

  const visit = (err: unknown, depth = 0) => {
    if (!err || depth > 4) return;
    if (err instanceof Error) {
      if (err.message) parts.push(err.message);
      const pg = err as { detail?: string; cause?: unknown };
      if (pg.detail?.trim()) detail = pg.detail.trim();
      visit(pg.cause, depth + 1);
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

  const firstLine = message.split("\n")[0]?.trim() ?? "";

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

  if (firstLine && !firstLine.includes("Failed query:")) {
    return firstLine.replace(/^(PostgresError|error):\s*/i, "").trim();
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

let cachedFuelTypeEnumLabels: string[] | undefined;
let cachedVehicleCategoryEnumLabels: string[] | undefined;

async function loadPgEnumLabels(typeName: string): Promise<string[]> {
  try {
    const rows = await getSql()`
      SELECT e.enumlabel::text AS label
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = ${typeName}
      ORDER BY e.enumsortorder
    `;
    return rows.map((row) => String(row.label));
  } catch {
    return [];
  }
}

async function loadFuelTypeEnumLabels(): Promise<string[]> {
  if (cachedFuelTypeEnumLabels === undefined) {
    cachedFuelTypeEnumLabels = await loadPgEnumLabels("fuel_type");
  }
  return cachedFuelTypeEnumLabels;
}

async function loadVehicleCategoryEnumLabels(): Promise<string[]> {
  if (cachedVehicleCategoryEnumLabels === undefined) {
    cachedVehicleCategoryEnumLabels = await loadPgEnumLabels("vehicle_category");
  }
  return cachedVehicleCategoryEnumLabels;
}



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

  vehicleCategory: string | null;

  seatingCapacity: number | null;

  acType: string | null;

};



export type RiderVehicleOnboardingPrefill = {
  registrationNumber: string | null;
  vehicleChoice: string | null;
  vehicleCategoryCode: string | null;
  resolvedVehicleType: string | null;
  vehicleTypeLabel: string | null;
  suggestedAcType: "AC" | "Non-AC" | null;
  suggestedIsCommercial: boolean | null;
};

export type RiderVehicleFormMode = "full" | "cashfree_missing_only";

export type RiderVehicleMissingField =
  | "vehicle_type"
  | "registration_number"
  | "fuel_type"
  | "make"
  | "model"
  | "color"
  | "year"
  | "service_types"
  | "ownership_type"
  | "is_commercial"
  | "seating_capacity"
  | "ac_type";

export type RiderVehicleFormMeta = {
  formMode: RiderVehicleFormMode;
  prefillSource: "cashfree_rc" | "manual" | null;
  initialStep: 1 | 2;
  step1Complete: boolean;
  step2Complete: boolean;
  missingFields: RiderVehicleMissingField[];
};

export type RiderVehicleStatusResponse = {

  hasVehicle: boolean;

  isComplete: boolean;

  vehicle: RiderVehicleAppDto | null;

  onboardingVehicleChoice: string | null;

  onboardingVehicleCategoryCode: string | null;

  onboardingPrefill: RiderVehicleOnboardingPrefill | null;

  formMeta: RiderVehicleFormMeta;

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

  vehicleCategoryCode?: string | null;

  onboardingVehicleChoice?: string | null;

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

    vehicleCategory: row.vehicleCategory ? String(row.vehicleCategory) : null,

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



const STEP1_MISSING_FIELDS = new Set<RiderVehicleMissingField>([
  "vehicle_type",
  "registration_number",
  "fuel_type",
  "make",
  "model",
  "color",
  "year",
]);

function readLimitationFlags(row: typeof riderVehicles.$inferSelect): Record<string, unknown> {
  const raw = row.limitationFlags;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function isCashfreeRcVehicleRow(
  row: typeof riderVehicles.$inferSelect | null | undefined,
): boolean {
  if (!row) return false;
  const flags = readLimitationFlags(row);
  if (flags.source === "cashfree_vehicle_rc") return true;
  const payload = row.cashfreeRcPayload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return Object.keys(payload as Record<string, unknown>).length > 0;
  }
  return false;
}

export function computeRiderVehicleMissingFields(
  row: typeof riderVehicles.$inferSelect | null | undefined,
): RiderVehicleMissingField[] {
  if (!row) {
    return [
      "vehicle_type",
      "registration_number",
      "service_types",
      "ownership_type",
    ];
  }

  const missing: RiderVehicleMissingField[] = [];
  const reg = normalizeRegistrationNumber(row.registrationNumber || "");
  if (reg.length < 4) missing.push("registration_number");

  const vehicleType = mapVehicleTypeFromDb(String(row.vehicleType));
  if (!VALID_VEHICLE_TYPES.has(vehicleType)) {
    missing.push("vehicle_type");
  } else if (vehicleType === "other" && (row.make?.trim().length ?? 0) < 2) {
    missing.push("make");
  }

  if (!row.fuelType) missing.push("fuel_type");

  const rawServices = row.serviceTypes;
  const serviceTypes = Array.isArray(rawServices)
    ? rawServices.filter((s): s is string => typeof s === "string")
    : [];
  if (serviceTypes.length < 1) missing.push("service_types");

  const ownership = row.ownershipType?.trim();
  if (!ownership || !VALID_OWNERSHIP_TYPES.has(ownership)) {
    missing.push("ownership_type");
  }

  return missing;
}

export function computeRiderVehicleFormMeta(
  row: typeof riderVehicles.$inferSelect | null | undefined,
): RiderVehicleFormMeta {
  const missingFields = computeRiderVehicleMissingFields(row);
  const step1Missing = missingFields.filter((field) => STEP1_MISSING_FIELDS.has(field));
  const step2Missing = missingFields.filter((field) => !STEP1_MISSING_FIELDS.has(field));
  const step1Complete = step1Missing.length === 0;
  const step2Complete = step2Missing.length === 0;
  const cashfree = isCashfreeRcVehicleRow(row);

  if (!cashfree) {
    return {
      formMode: "full",
      prefillSource: row ? "manual" : null,
      initialStep: 1,
      step1Complete,
      step2Complete,
      missingFields,
    };
  }

  return {
    formMode: "cashfree_missing_only",
    prefillSource: "cashfree_rc",
    initialStep: step1Complete ? 2 : 1,
    step1Complete,
    step2Complete,
    missingFields,
  };
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



async function readOnboardingVehicleSelectionForApp(riderId: number): Promise<{
  onboardingVehicleChoice: string | null;
  onboardingVehicleCategoryCode: string | null;
  onboardingPrefill: RiderVehicleOnboardingPrefill | null;
}> {
  const { readRiderOnboardingVehicleSelection } = await import(
    "./rider-onboarding-progress.js"
  );
  const {
    resolveVehicleTypeFromOnboardingChoice,
    suggestAcTypeForCategory,
    suggestIsCommercialForCategory,
  } = await import("./rider-onboarding-vehicle-resolve.js");

  const selection = await readRiderOnboardingVehicleSelection(riderId);
  const choice = selection.vehicleChoice;
  const categoryCode = selection.vehicleCategoryCode;

  if (!choice && !selection.registrationNumber) {
    return {
      onboardingVehicleChoice: choice,
      onboardingVehicleCategoryCode: categoryCode,
      onboardingPrefill: null,
    };
  }

  const resolved = await resolveVehicleTypeFromOnboardingChoice(choice, "bike");

  let vehicleTypeLabel: string | null = resolved.customTypeLabel;
  if (choice) {
    const db = (await import("../db/client.js")).getDb();
    const { riderOnboardingVehicleTypes } = await import("../db/schema.js");
    const { eq, and } = await import("drizzle-orm");
    const [catalogRow] = await db
      .select({ label: riderOnboardingVehicleTypes.label })
      .from(riderOnboardingVehicleTypes)
      .where(
        and(
          eq(riderOnboardingVehicleTypes.code, choice),
          eq(riderOnboardingVehicleTypes.isActive, true)
        )
      )
      .limit(1);
    vehicleTypeLabel = catalogRow?.label?.trim() ?? vehicleTypeLabel;
  }

  const regFromOnboarding = selection.registrationNumber
    ? normalizeRegistrationNumber(selection.registrationNumber)
    : null;

  return {
    onboardingVehicleChoice: choice,
    onboardingVehicleCategoryCode: categoryCode,
    onboardingPrefill: {
      registrationNumber: regFromOnboarding,
      vehicleChoice: choice,
      vehicleCategoryCode: categoryCode,
      resolvedVehicleType: resolved.vehicleType,
      vehicleTypeLabel,
      suggestedAcType: suggestAcTypeForCategory(categoryCode),
      suggestedIsCommercial: suggestIsCommercialForCategory(categoryCode),
    },
  };
}

export async function getRiderVehicleStatusForApp(

  riderId: number,

): Promise<RiderVehicleStatusResponse> {

  const onboardingSelection = await readOnboardingVehicleSelectionForApp(riderId);

  const row = await getActiveRiderVehicleRow(riderId);

  if (!row) {

    return {
      hasVehicle: false,
      isComplete: false,
      vehicle: null,
      formMeta: computeRiderVehicleFormMeta(null),
      ...onboardingSelection,
    };

  }

  const vehicle = rowToDto(row);

  return {

    hasVehicle: true,

    isComplete: isRiderVehicleComplete(row),

    vehicle,

    formMeta: computeRiderVehicleFormMeta(row),

    ...onboardingSelection,

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



  let serviceTypes = normalizeServiceTypes(input.serviceTypes);
  serviceTypes = filterDispatchServicesForRiderProfile(
    serviceTypes as Parameters<typeof filterDispatchServicesForRiderProfile>[0],
    { vehicleTypes: [vehicleType] }
  );

  if (serviceTypes.length < 1) {
    return {
      ok: false,
      error: "Food delivery is not available for 3-wheeler and 4-wheeler vehicles.",
    };
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
  data: PersistVehicleData & {
    onboardingVehicleCategoryCode?: string | null;
    onboardingVehicleTypeCode?: string | null;
  },
  existingId: number | null,
): Promise<void> {
  const sql = getSql();

  const [fuelLabels, vehicleCategoryLabels] = await Promise.all([
    loadFuelTypeEnumLabels(),
    loadVehicleCategoryEnumLabels(),
  ]);

  const vehicleTypeDb = mapVehicleTypeToDb(data.vehicleType);
  const fuelTypeDb = resolveFuelTypeDbLabel(data.fuelType, fuelLabels);
  const vehicleCategoryDb = resolveVehicleCategoryDbLabel(
    data.onboardingVehicleCategoryCode,
    data.vehicleType,
    vehicleCategoryLabels,
  );

  const limitationFlags: Record<string, string> = {};
  if (data.onboardingVehicleTypeCode?.trim()) {
    limitationFlags.onboardingVehicleTypeCode = data.onboardingVehicleTypeCode.trim();
  }
  if (data.onboardingVehicleCategoryCode?.trim()) {
    limitationFlags.onboardingVehicleCategoryCode =
      data.onboardingVehicleCategoryCode.trim();
  }

  const serviceTypesJson = JSON.stringify(data.serviceTypes);
  const limitationFlagsJson = JSON.stringify(limitationFlags);
  const make = data.make ?? null;
  const model = data.model ?? null;
  const year = data.year ?? null;
  const color = data.color ?? null;
  const registrationState = data.registrationState ?? null;
  const ownershipType = data.ownershipType ?? null;
  const seatingCapacity = data.seatingCapacity ?? null;
  const acType = data.acType ?? null;

  if (existingId != null) {
    await sql`
      UPDATE rider_vehicles
      SET
        vehicle_type = ${vehicleTypeDb}::vehicle_type,
        registration_number = ${data.registrationNumber},
        vehicle_number = ${data.vehicleNumber},
        fuel_type = ${fuelTypeDb}::fuel_type,
        make = ${make},
        model = ${model},
        year = ${year},
        color = ${color},
        registration_state = ${registrationState},
        ownership_type = ${ownershipType},
        service_types = ${serviceTypesJson}::jsonb,
        is_commercial = ${data.isCommercial},
        seating_capacity = ${seatingCapacity},
        ac_type = ${acType}::ac_type,
        vehicle_category = ${vehicleCategoryDb}::vehicle_category,
        limitation_flags = COALESCE(limitation_flags, '{}'::jsonb) || ${limitationFlagsJson}::jsonb,
        vehicle_active_status = 'active',
        is_active = true,
        updated_at = NOW()
      WHERE id = ${existingId}
        AND rider_id = ${riderId}
    `;
    return;
  }

  await sql`
    INSERT INTO rider_vehicles (
      rider_id,
      vehicle_type,
      registration_number,
      vehicle_number,
      fuel_type,
      make,
      model,
      year,
      color,
      registration_state,
      ownership_type,
      service_types,
      is_commercial,
      seating_capacity,
      ac_type,
      vehicle_category,
      limitation_flags,
      vehicle_active_status,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      ${riderId},
      ${vehicleTypeDb}::vehicle_type,
      ${data.registrationNumber},
      ${data.vehicleNumber},
      ${fuelTypeDb}::fuel_type,
      ${make},
      ${model},
      ${year},
      ${color},
      ${registrationState},
      ${ownershipType},
      ${serviceTypesJson}::jsonb,
      ${data.isCommercial},
      ${seatingCapacity},
      ${acType}::ac_type,
      ${vehicleCategoryDb}::vehicle_category,
      ${limitationFlagsJson}::jsonb,
      'active',
      true,
      NOW(),
      NOW()
    )
  `;
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

  const { resolveVehicleOnboardingCategoryCode } = await import(
    "./rider-vehicle-category-service-assignments.js"
  );
  const { filterDispatchServicesByVehicleAssignments } = await import(
    "./rider-vehicle-type-service-assignments.js"
  );
  const { readRiderOnboardingVehicleSelection } = await import(
    "./rider-onboarding-progress.js"
  );

  const onboardingSelection = await readRiderOnboardingVehicleSelection(riderId);

  const onboardingChoice =
    input.onboardingVehicleChoice?.trim() ||
    onboardingSelection.vehicleChoice?.trim() ||
    null;

  const { resolveVehicleTypeFromOnboardingChoice } = await import(
    "./rider-onboarding-vehicle-resolve.js"
  );
  const resolvedFromOnboarding = await resolveVehicleTypeFromOnboardingChoice(
    onboardingChoice,
    data.vehicleType
  );

  let make = data.make;
  let model = data.model;
  if (
    resolvedFromOnboarding.vehicleType === "other" &&
    resolvedFromOnboarding.customTypeLabel &&
    !make?.trim()
  ) {
    make = resolvedFromOnboarding.customTypeLabel;
  }

  const resolvedVehicleType = resolvedFromOnboarding.vehicleType;

  const onboardingCategoryCode =
    normalizeOnboardingCategoryCode(
      input.vehicleCategoryCode ?? onboardingSelection.vehicleCategoryCode ?? null,
    ) ??
    (await resolveVehicleOnboardingCategoryCode(resolvedVehicleType, null));

  const vehicleTypesForAssignment = [
    resolvedVehicleType,
    onboardingChoice ?? "",
  ].filter((v) => v.trim().length > 0);

  let serviceTypes = data.serviceTypes;
  const selectedServices = [...serviceTypes];
  serviceTypes = await filterDispatchServicesByVehicleAssignments(
    serviceTypes as ("food" | "parcel" | "person_ride")[],
    {
      vehicleTypes: vehicleTypesForAssignment,
      vehicleCategories: onboardingCategoryCode ? [onboardingCategoryCode] : [],
    }
  );
  if (serviceTypes.length < 1) {
    serviceTypes = filterDispatchServicesForRiderProfile(
      selectedServices as Parameters<typeof filterDispatchServicesForRiderProfile>[0],
      {
        vehicleTypes: [resolvedVehicleType],
        vehicleCategories: onboardingCategoryCode ? [onboardingCategoryCode] : [],
      },
    );
  }
  if (serviceTypes.length < 1 && selectedServices.length > 0) {
    serviceTypes = selectedServices;
  }
  if (serviceTypes.length < 1) {
    throw new Error(
      "Selected services are not available for your vehicle type. Update service selection."
    );
  }

  const persistData = {
    ...data,
    vehicleType: resolvedVehicleType,
    make,
    model,
    serviceTypes,
    onboardingVehicleCategoryCode: onboardingCategoryCode,
    onboardingVehicleTypeCode: onboardingChoice,
  };

  const existing = await getActiveRiderVehicleRow(riderId);



  try {

    await persistRiderVehicleRow(riderId, persistData, existing ? Number(existing.id) : null);

  } catch (error) {

    throw new Error(parseVehicleDbError(error));

  }



  return getRiderVehicleStatusForApp(riderId);

}


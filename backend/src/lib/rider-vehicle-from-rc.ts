/**
 * Project Cashfree vehicle_rc verifiedData into public.rider_vehicles.
 * RC is vehicle ownership verification — fill profile columns; keep extra RC
 * fields in limitation_flags for future NOC / fleet / insurance flows.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { riderVehicles } from "../db/schema.js";
import {
  mapVehicleTypeToDb,
  resolveFuelTypeDbLabel,
  resolveVehicleCategoryDbLabel,
} from "./rider-vehicle-db-map.js";

function deriveRegistrationStateFromPlate(registrationNumber: string): string | null {
  const match = registrationNumber.match(/^([A-Z]{2})/);
  return match ? match[1]! : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeReg(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return v.length >= 4 ? v : null;
}

/** Cashfree fuel labels → app fuel codes. */
function mapCashfreeFuelToApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase();
  if (/PETROL|MOTOR\s*SPIRIT|MS\b/.test(u)) return "petrol";
  if (/DIESEL|HSD/.test(u)) return "diesel";
  if (/\bCNG\b|COMPRESSED\s*NATURAL/.test(u)) return "cng";
  if (/ELECTRIC|EV\b|BATTERY/.test(u)) return "electric";
  if (/HYBRID/.test(u)) return "hybrid";
  if (/LPG/.test(u)) return "cng";
  return null;
}

/** Parse dates like YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, MM/YYYY → YYYY-MM-DD | null. */
export function parseRcDateToIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || /^na$/i.test(s) || s === "-" || s === "00/00/0000") return null;
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  const my = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (my) {
    return `${my[2]}-${my[1]!.padStart(2, "0")}-01`;
  }
  return null;
}

function yearFromRegDate(raw: string | null | undefined): number | null {
  const iso = parseRcDateToIso(raw);
  if (!iso) return null;
  const y = Number(iso.slice(0, 4));
  const current = new Date().getFullYear() + 1;
  if (y >= 1980 && y <= current) return y;
  return null;
}

function parseIsCommercial(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (["true", "yes", "y", "1", "commercial"].includes(s)) return true;
  if (["false", "no", "n", "0", "non-commercial", "private"].includes(s)) return false;
  return null;
}

async function loadFuelTypeEnumLabels(): Promise<string[]> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT e.enumlabel AS label
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'fuel_type'
      ORDER BY e.enumsortorder
    `;
    return (rows as unknown as { label: string }[]).map((r) => r.label);
  } catch {
    return [];
  }
}

async function loadVehicleCategoryEnumLabels(): Promise<string[]> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT e.enumlabel AS label
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'vehicle_category'
      ORDER BY e.enumsortorder
    `;
    return (rows as unknown as { label: string }[]).map((r) => r.label);
  } catch {
    return [];
  }
}

/**
 * After Cashfree RC verify succeeds, upsert the rider's active vehicle row.
 * Never throws to the verification pipeline — logs and returns.
 */
export async function upsertRiderVehicleFromRcVerifiedData(args: {
  riderId: number;
  verifiedData: Record<string, unknown>;
  /** Optional RC photo URL from rider_documents when already uploaded. */
  rcDocumentUrl?: string | null;
}): Promise<{ ok: true; vehicleId: number | null } | { ok: false; error: string }> {
  const riderId = args.riderId;
  const data = args.verifiedData;

  const registrationNumber = normalizeReg(
    str(data.reg_no) || str(data.registration_number) || str(data.vehicle_number),
  );
  if (!registrationNumber) {
    return { ok: false, error: "missing_reg_no" };
  }

  try {
    const { readRiderOnboardingVehicleSelection } = await import(
      "./rider-onboarding-progress.js"
    );
    const {
      resolveVehicleTypeFromOnboardingChoice,
      suggestAcTypeForCategory,
      suggestIsCommercialForCategory,
    } = await import("./rider-onboarding-vehicle-resolve.js");

    const selection = await readRiderOnboardingVehicleSelection(riderId);
    const resolved = await resolveVehicleTypeFromOnboardingChoice(
      selection.vehicleChoice,
      "bike",
    );
    const vehicleType = resolved.vehicleType || "bike";
    const categoryCode = selection.vehicleCategoryCode;
    const suggestedCommercial = suggestIsCommercialForCategory(categoryCode);
    const suggestedAc = suggestAcTypeForCategory(categoryCode);

    const make =
      str(data.vehicle_manufacturer_name) ||
      str(data.maker_description) ||
      str(data.make);
    const model = str(data.model) || str(data.maker_model);
    const color = str(data.vehicle_colour) || str(data.color);
    const fuelApp = mapCashfreeFuelToApp(str(data.fuel_type) || str(data.type));
    const insuranceExpiry = parseRcDateToIso(str(data.vehicle_insurance_upto));
    const year = yearFromRegDate(str(data.reg_date));
    const registrationState = deriveRegistrationStateFromPlate(registrationNumber);
    const commercialFromRc = parseIsCommercial(data.is_commercial);
    const isCommercial =
      commercialFromRc ?? suggestedCommercial ?? false;
    const ownershipType = selection.vehicleChoice ? "ownership" : null;

    const [fuelLabels, categoryLabels] = await Promise.all([
      loadFuelTypeEnumLabels(),
      loadVehicleCategoryEnumLabels(),
    ]);
    const vehicleTypeDb = mapVehicleTypeToDb(vehicleType);
    const fuelTypeDb = resolveFuelTypeDbLabel(fuelApp, fuelLabels);
    const vehicleCategoryDb = resolveVehicleCategoryDbLabel(
      categoryCode,
      vehicleType,
      categoryLabels,
    );

    const rcMeta: Record<string, unknown> = {
      source: "cashfree_vehicle_rc",
      vehicleVerificationOnly: true,
      projectedAt: new Date().toISOString(),
    };
    const owner = str(data.owner) || str(data.owner_name);
    if (owner) rcMeta.rcOwnerName = owner;
    const father = str(data.owner_father_name);
    if (father) rcMeta.rcOwnerFatherName = father;
    const rcStatus = str(data.rc_status);
    if (rcStatus) rcMeta.rcStatus = rcStatus;
    const vehicleClass = str(data.vehicle_class) || str(data.class);
    if (vehicleClass) rcMeta.vehicleClass = vehicleClass;
    const bodyType = str(data.body_type);
    if (bodyType) rcMeta.bodyType = bodyType;
    const financer = str(data.rc_financer);
    if (financer) rcMeta.rcFinancer = financer;
    const insurer = str(data.vehicle_insurance_company_name);
    if (insurer) rcMeta.insuranceCompany = insurer;
    const chassis =
      str(data.vehicle_chasi_number) ||
      str(data.chassis_number) ||
      str(data.vehicle_chassis_number);
    if (chassis) rcMeta.chassisNumber = chassis;
    const engine =
      str(data.vehicle_engine_number) || str(data.engine_number);
    if (engine) rcMeta.engineNumber = engine;
    const fitness = parseRcDateToIso(str(data.fitness_upto));
    if (fitness) rcMeta.fitnessUpto = fitness;
    const puc = parseRcDateToIso(str(data.puc_upto));
    if (puc) rcMeta.pucUpto = puc;
    const rcExpiry = parseRcDateToIso(str(data.rc_expiry_date));
    if (rcExpiry) rcMeta.rcExpiryDate = rcExpiry;
    if (selection.vehicleChoice) {
      rcMeta.onboardingVehicleTypeCode = selection.vehicleChoice;
    }
    if (categoryCode) {
      rcMeta.onboardingVehicleCategoryCode = categoryCode;
    }

    const rcDocumentUrl =
      str(args.rcDocumentUrl) ||
      selection.rcDocumentUrl ||
      "electronic_verified";

    const db = getDb();
    const sql = getSql();

    const existingRows = await db
      .select({
        id: riderVehicles.id,
        registrationNumber: riderVehicles.registrationNumber,
      })
      .from(riderVehicles)
      .where(
        and(
          eq(riderVehicles.riderId, riderId),
          isNull(riderVehicles.deletedAt),
        ),
      )
      .orderBy(desc(riderVehicles.isActive), desc(riderVehicles.updatedAt))
      .limit(5);

    const matchByReg = existingRows.find(
      (r) =>
        normalizeReg(r.registrationNumber) === registrationNumber,
    );
    const activeRow = existingRows[0];
    const targetId = matchByReg?.id ?? activeRow?.id ?? null;
    const previousReg =
      targetId != null
        ? normalizeReg(
            existingRows.find((r) => r.id === targetId)?.registrationNumber,
          )
        : null;
    // Rider corrected a wrong RC (e.g. bank page → back → new verify): replace
    // RC-sourced profile fields instead of COALESCE-keeping stale old-plate data.
    const isRcPlateReplace =
      previousReg != null && previousReg !== registrationNumber;

    const limitationFlagsJson = JSON.stringify(rcMeta);
    const cashfreePayloadJson = JSON.stringify(data);
    const acType = suggestedAc;
    const vehicleNumber = registrationNumber;
    const ownerName = owner;
    const nextRcDocumentUrl = isRcPlateReplace
      ? str(args.rcDocumentUrl) || "electronic_verified"
      : rcDocumentUrl;

    if (targetId != null) {
      if (isRcPlateReplace) {
        await sql`
          UPDATE public.rider_vehicles
          SET
            vehicle_type = COALESCE(${vehicleTypeDb}::vehicle_type, vehicle_type),
            registration_number = ${registrationNumber},
            vehicle_number = ${vehicleNumber},
            fuel_type = ${fuelTypeDb}::fuel_type,
            make = ${make},
            model = ${model},
            year = ${year},
            color = ${color},
            registration_state = ${registrationState},
            ownership_type = COALESCE(${ownershipType}, ownership_type),
            is_commercial = ${isCommercial},
            ac_type = COALESCE(${acType}::ac_type, ac_type),
            vehicle_category = COALESCE(${vehicleCategoryDb}::vehicle_category, vehicle_category),
            insurance_expiry = ${insuranceExpiry}::date,
            chassis_number = ${chassis},
            engine_number = ${engine},
            fitness_expiry = ${fitness}::date,
            puc_expiry = ${puc}::date,
            rc_owner_name = ${ownerName},
            cashfree_rc_payload = ${cashfreePayloadJson}::text::jsonb,
            rc_document_url = ${nextRcDocumentUrl},
            verified = TRUE,
            verified_at = NOW(),
            vehicle_active_status = 'active',
            is_active = TRUE,
            limitation_flags = ${limitationFlagsJson}::text::jsonb,
            updated_at = NOW()
          WHERE id = ${targetId}
            AND rider_id = ${riderId}
        `;
      } else {
        await sql`
          UPDATE public.rider_vehicles
          SET
            vehicle_type = COALESCE(${vehicleTypeDb}::vehicle_type, vehicle_type),
            registration_number = ${registrationNumber},
            vehicle_number = COALESCE(${vehicleNumber}, vehicle_number),
            fuel_type = COALESCE(${fuelTypeDb}::fuel_type, fuel_type),
            make = COALESCE(${make}, make),
            model = COALESCE(${model}, model),
            year = COALESCE(${year}, year),
            color = COALESCE(${color}, color),
            registration_state = COALESCE(${registrationState}, registration_state),
            ownership_type = COALESCE(${ownershipType}, ownership_type),
            is_commercial = ${isCommercial},
            ac_type = COALESCE(${acType}::ac_type, ac_type),
            vehicle_category = COALESCE(${vehicleCategoryDb}::vehicle_category, vehicle_category),
            insurance_expiry = COALESCE(${insuranceExpiry}::date, insurance_expiry),
            chassis_number = COALESCE(${chassis}, chassis_number),
            engine_number = COALESCE(${engine}, engine_number),
            fitness_expiry = COALESCE(${fitness}::date, fitness_expiry),
            puc_expiry = COALESCE(${puc}::date, puc_expiry),
            rc_owner_name = COALESCE(${ownerName}, rc_owner_name),
            cashfree_rc_payload = ${cashfreePayloadJson}::text::jsonb,
            rc_document_url = COALESCE(NULLIF(${nextRcDocumentUrl}, ''), rc_document_url),
            verified = TRUE,
            verified_at = COALESCE(verified_at, NOW()),
            vehicle_active_status = 'active',
            is_active = TRUE,
            limitation_flags = COALESCE(limitation_flags, '{}'::jsonb) || ${limitationFlagsJson}::text::jsonb,
            updated_at = NOW()
          WHERE id = ${targetId}
            AND rider_id = ${riderId}
        `;
      }
      return { ok: true, vehicleId: Number(targetId) };
    }

    await sql`
      INSERT INTO public.rider_vehicles (
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
        ac_type,
        vehicle_category,
        insurance_expiry,
        chassis_number,
        engine_number,
        fitness_expiry,
        puc_expiry,
        rc_owner_name,
        cashfree_rc_payload,
        rc_document_url,
        verified,
        verified_at,
        limitation_flags,
        vehicle_active_status,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        ${riderId},
        ${vehicleTypeDb}::vehicle_type,
        ${registrationNumber},
        ${vehicleNumber},
        ${fuelTypeDb}::fuel_type,
        ${make},
        ${model},
        ${year},
        ${color},
        ${registrationState},
        ${ownershipType},
        '[]'::jsonb,
        ${isCommercial},
        ${acType}::ac_type,
        ${vehicleCategoryDb}::vehicle_category,
        ${insuranceExpiry}::date,
        ${chassis},
        ${engine},
        ${fitness}::date,
        ${puc}::date,
        ${ownerName},
        ${cashfreePayloadJson}::text::jsonb,
        ${rcDocumentUrl},
        TRUE,
        NOW(),
        ${limitationFlagsJson}::text::jsonb,
        'active',
        TRUE,
        NOW(),
        NOW()
      )
    `;

    return { ok: true, vehicleId: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[upsertRiderVehicleFromRcVerifiedData]", riderId, msg);
    return { ok: false, error: msg };
  }
}

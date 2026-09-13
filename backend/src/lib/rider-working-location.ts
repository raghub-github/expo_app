/**

 * Persist current working location on riders.* without touching registered_*,

 * and append a history row when the working area meaningfully changes.

 */

import { and, eq } from "drizzle-orm";

import { getDb } from "../db/client.js";

import { riders, riderWorkingLocationHistory } from "../db/schema.js";



export type WorkingLocationSource =

  | "gps_auto"

  | "manual_select"

  | "manual_other"

  | "system_backfill"

  | "duty_update";



export type WorkingLocationInput = {

  riderId: number;

  city?: string | null;

  state: string;

  region?: string | null;

  district?: string | null;

  pincode?: string | null;

  address?: string | null;

  lat?: number | null;

  lon?: number | null;

  stateId?: string | null;

  regionId?: string | null;

  districtId?: string | null;

  locationSource?: WorkingLocationSource | null;

  locationOtherState?: string | null;

  locationOtherDistrict?: string | null;

  /** When true (first onboarding confirm), also seed registered_* if empty. */

  seedRegisteredIfEmpty?: boolean;

};



/** Sources allowed on riders.location_source before migration 0618. */

const LEGACY_RIDERS_LOCATION_SOURCES = new Set([

  "gps_auto",

  "manual_select",

  "manual_other",

]);



function norm(v: string | null | undefined): string {

  return String(v || "")

    .trim()

    .toLowerCase()

    .replace(/\s+/g, " ");

}



function workingAreaKey(input: {

  stateId?: string | null;

  districtId?: string | null;

  state?: string | null;

  district?: string | null;

}): string {

  const sid = String(input.stateId || "").trim().toLowerCase();

  const did = String(input.districtId || "").trim().toLowerCase();

  if (sid || did) return `${sid}|${did}`;

  return `${norm(input.state)}|${norm(input.district)}`;

}



function isLocationSourceCheckError(err: unknown): boolean {

  const msg = err instanceof Error ? err.message : String(err ?? "");

  return (

    /riders_location_source_check/i.test(msg) ||

    (/location_source/i.test(msg) && /check constraint|violates check/i.test(msg))

  );

}



export async function saveRiderWorkingLocation(input: WorkingLocationInput): Promise<{

  city: string | null;

  state: string | null;

  region: string | null;

  district: string | null;

  pincode: string | null;

  address: string | null;

  lat: number | null;

  lon: number | null;

  stateId: string | null;

  regionId: string | null;

  districtId: string | null;

  locationSource: string | null;

}> {

  const db = getDb();

  const [existing] = await db

    .select({

      state: riders.state,

      district: riders.district,

      region: riders.region,

      city: riders.city,

      pincode: riders.pincode,

      address: riders.address,

      lat: riders.lat,

      lon: riders.lon,

      stateId: riders.stateId,

      regionId: riders.regionId,

      districtId: riders.districtId,

      locationSource: riders.locationSource,

      registeredState: riders.registeredState,

      registeredCity: riders.registeredCity,

      registeredDistrict: riders.registeredDistrict,

      registeredAddress: riders.registeredAddress,

    })

    .from(riders)

    .where(eq(riders.id, input.riderId))

    .limit(1);



  if (!existing) {

    throw Object.assign(new Error("Rider not found"), { statusCode: 404 });

  }



  const nextState = input.state.trim();

  const nextDistrict = input.district?.trim() || null;

  const nextRegion = input.region?.trim() || null;

  const nextCity =

    String(input.city || nextDistrict || nextRegion || nextState).trim() || null;

  const nextAddress =

    String(input.address || "").trim() ||

    [nextDistrict, nextRegion, nextState].filter(Boolean).join(", ") ||

    nextState;

  const historySource = (input.locationSource || "duty_update") as WorkingLocationSource;

  // Prefer requested source on riders.*; fall back to gps_auto if DB check is pre-0618.

  let ridersSource: WorkingLocationSource = historySource;



  const prevKey = workingAreaKey(existing);

  const nextKey = workingAreaKey({

    stateId: input.stateId,

    districtId: input.districtId,

    state: nextState,

    district: nextDistrict,

  });

  const changed = prevKey !== nextKey && Boolean(existing.state || existing.stateId);



  const buildPatch = (source: WorkingLocationSource): Record<string, unknown> => {

    const patch: Record<string, unknown> = {

      city: nextCity,

      state: nextState,

      region: nextRegion,

      district: nextDistrict,

      pincode: input.pincode?.trim() || null,

      address: nextAddress,

      stateId: input.stateId || null,

      regionId: input.regionId || null,

      districtId: input.districtId || null,

      locationSource: source,

      locationOtherState:

        source === "manual_other"

          ? String(input.locationOtherState || nextState).trim()

          : null,

      locationOtherDistrict:

        source === "manual_other"

          ? String(input.locationOtherDistrict || nextDistrict || "").trim() || null

          : null,

      updatedAt: new Date(),

    };

    if (input.lat != null && Number.isFinite(input.lat)) {

      patch.lat = parseFloat(Number(input.lat).toFixed(8));

    }

    if (input.lon != null && Number.isFinite(input.lon)) {

      patch.lon = parseFloat(Number(input.lon).toFixed(8));

    }



    // First confirmed location seeds permanent registered address (once).

    // Never overwrite registered_* when already set (old + new riders).

    const registeredEmpty =

      !norm(existing.registeredState) &&

      !norm(existing.registeredCity) &&

      !norm(existing.registeredDistrict) &&

      !norm(existing.registeredAddress);

    if (input.seedRegisteredIfEmpty && registeredEmpty) {

      patch.registeredCity = nextCity;

      patch.registeredState = nextState;

      patch.registeredRegion = nextRegion;

      patch.registeredDistrict = nextDistrict;

      patch.registeredPincode = input.pincode?.trim() || null;

      patch.registeredAddress = nextAddress;

      patch.registeredStateId = input.stateId || null;

      patch.registeredRegionId = input.regionId || null;

      patch.registeredDistrictId = input.districtId || null;

      if (input.lat != null && Number.isFinite(input.lat)) {

        patch.registeredLat = parseFloat(Number(input.lat).toFixed(8));

      }

      if (input.lon != null && Number.isFinite(input.lon)) {

        patch.registeredLon = parseFloat(Number(input.lon).toFixed(8));

      }

    }

    return patch;

  };



  let updated: {

    city: string | null;

    state: string | null;

    region: string | null;

    district: string | null;

    pincode: string | null;

    address: string | null;

    lat: number | null;

    lon: number | null;

    stateId: string | null;

    regionId: string | null;

    districtId: string | null;

    locationSource: string | null;

  } | undefined;



  try {

    const [row] = await db

      .update(riders)

      .set(buildPatch(ridersSource))

      .where(eq(riders.id, input.riderId))

      .returning({

        city: riders.city,

        state: riders.state,

        region: riders.region,

        district: riders.district,

        pincode: riders.pincode,

        address: riders.address,

        lat: riders.lat,

        lon: riders.lon,

        stateId: riders.stateId,

        regionId: riders.regionId,

        districtId: riders.districtId,

        locationSource: riders.locationSource,

      });

    updated = row;

  } catch (err) {

    // Pre-0618 DBs: map duty_update/system_backfill → gps_auto on riders column only.

    if (

      isLocationSourceCheckError(err) &&

      !LEGACY_RIDERS_LOCATION_SOURCES.has(ridersSource)

    ) {

      ridersSource = "gps_auto";

      const [row] = await db

        .update(riders)

        .set(buildPatch(ridersSource))

        .where(eq(riders.id, input.riderId))

        .returning({

          city: riders.city,

          state: riders.state,

          region: riders.region,

          district: riders.district,

          pincode: riders.pincode,

          address: riders.address,

          lat: riders.lat,

          lon: riders.lon,

          stateId: riders.stateId,

          regionId: riders.regionId,

          districtId: riders.districtId,

          locationSource: riders.locationSource,

        });

      updated = row;

      console.warn(

        "[working-location] location_source check rejected; wrote gps_auto on riders (history keeps original source)",

      );

    } else {

      throw err;

    }

  }



  // History: clear prior current flag, append new current snapshot when area changed

  // or when rider has no history row yet. History keeps the original source (duty_update).

  try {

    const [currentHist] = await db

      .select({ id: riderWorkingLocationHistory.id })

      .from(riderWorkingLocationHistory)

      .where(

        and(

          eq(riderWorkingLocationHistory.riderId, input.riderId),

          eq(riderWorkingLocationHistory.isCurrent, true),

        ),

      )

      .limit(1);



    if (changed || !currentHist) {

      if (currentHist) {

        await db

          .update(riderWorkingLocationHistory)

          .set({ isCurrent: false })

          .where(eq(riderWorkingLocationHistory.id, currentHist.id));

      }

      await db.insert(riderWorkingLocationHistory).values({

        riderId: input.riderId,

        state: nextState,

        region: nextRegion,

        district: nextDistrict,

        city: nextCity,

        pincode: input.pincode?.trim() || null,

        address: nextAddress,

        stateId: input.stateId || null,

        regionId: input.regionId || null,

        districtId: input.districtId || null,

        lat: input.lat != null && Number.isFinite(input.lat) ? Number(input.lat) : null,

        lon: input.lon != null && Number.isFinite(input.lon) ? Number(input.lon) : null,

        source: historySource,

        isCurrent: true,

        changedAt: new Date(),

      });

    }

  } catch (err) {

    // Table may not exist until migration — never fail the location save.

    console.warn(

      "[working-location] history write skipped:",

      err instanceof Error ? err.message : err,

    );

  }



  return {

    city: updated?.city ?? null,

    state: updated?.state ?? null,

    region: updated?.region ?? null,

    district: updated?.district ?? null,

    pincode: updated?.pincode ?? null,

    address: updated?.address ?? null,

    lat: updated?.lat ?? null,

    lon: updated?.lon ?? null,

    stateId: updated?.stateId ?? null,

    regionId: updated?.regionId ?? null,

    districtId: updated?.districtId ?? null,

    locationSource: updated?.locationSource ?? null,

  };

}



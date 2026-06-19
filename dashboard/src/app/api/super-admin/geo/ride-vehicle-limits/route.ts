import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteRideVehicleLimit,
  listRideVehicleLimits,
  upsertRideVehicleLimit,
  RIDE_VEHICLE_LIMIT_TYPES,
} from "@/lib/db/operations/ride-vehicle-limits-admin";

export const runtime = "nodejs";

const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);

const postSchema = z.object({
  stateId: z.string().uuid(),
  limits: z.array(
    z.object({
      vehicleType: vehicleSchema,
      /** Omit or set unlimited:true to remove cap (all-India rides). */
      maxDistanceKm: z.number().positive().optional(),
      isEnabled: z.boolean().optional(),
      unlimited: z.boolean().optional(),
    })
  ),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const stateId = req.nextUrl.searchParams.get("stateId");
  if (!stateId) return NextResponse.json({ error: "stateId required" }, { status: 400 });

  try {
    const limits = await listRideVehicleLimits(stateId);
    return NextResponse.json({ limits, vehicleTypes: RIDE_VEHICLE_LIMIT_TYPES });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const saved = [];
    for (const row of parsed.data.limits) {
      const unlimited = row.unlimited === true || row.maxDistanceKm == null;
      if (unlimited) {
        await deleteRideVehicleLimit(parsed.data.stateId, row.vehicleType);
        continue;
      }
      const maxDistanceKm = row.maxDistanceKm;
      if (maxDistanceKm == null) continue;
      saved.push(
        await upsertRideVehicleLimit({
          stateId: parsed.data.stateId,
          vehicleType: row.vehicleType,
          maxDistanceKm,
          isEnabled: row.isEnabled ?? true,
        })
      );
    }
    return NextResponse.json({ limits: saved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}

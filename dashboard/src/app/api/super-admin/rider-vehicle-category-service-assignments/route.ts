import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  ensureDefaultCategoryServiceAssignments,
  listRiderVehicleCategoryServiceAssignments,
  upsertRiderVehicleCategoryServiceAssignments,
} from "@/lib/db/operations/rider-vehicle-category-service-assignments";
import {
  ensureDefaultVehicleTypeServiceAssignments,
  listRiderVehicleTypeServiceAssignments,
  upsertRiderVehicleTypeServiceAssignments,
} from "@/lib/db/operations/rider-vehicle-type-service-assignments";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    let categoryRows = await listRiderVehicleCategoryServiceAssignments();
    if (categoryRows.length === 0) {
      await ensureDefaultCategoryServiceAssignments();
      categoryRows = await listRiderVehicleCategoryServiceAssignments();
    }
    let vehicleRows = await listRiderVehicleTypeServiceAssignments();
    if (vehicleRows.length === 0) {
      await ensureDefaultVehicleTypeServiceAssignments();
      vehicleRows = await listRiderVehicleTypeServiceAssignments();
    }
    return NextResponse.json({ success: true, categoryRows, vehicleRows });
  } catch (e) {
    console.error("[super-admin rider-vehicle-category-service-assignments GET]", e);
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

const putSchema = z.object({
  categoryAssignments: z
    .array(
      z.object({
        categoryCode: z.string().min(1).max(64),
        serviceType: z.enum(["food", "parcel", "person_ride"]),
        isAssigned: z.boolean(),
      })
    )
    .optional(),
  vehicleAssignments: z
    .array(
      z.object({
        vehicleTypeCode: z.string().min(1).max(64),
        serviceType: z.enum(["food", "parcel", "person_ride"]),
        isAssigned: z.boolean(),
      })
    )
    .optional(),
  /** @deprecated use categoryAssignments */
  assignments: z
    .array(
      z.object({
        categoryCode: z.string().min(1).max(64),
        serviceType: z.enum(["food", "parcel", "person_ride"]),
        isAssigned: z.boolean(),
      })
    )
    .optional(),
});

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const categoryPatches =
      parsed.data.categoryAssignments ?? parsed.data.assignments ?? [];
    const vehiclePatches = parsed.data.vehicleAssignments ?? [];

    if (categoryPatches.length) {
      await upsertRiderVehicleCategoryServiceAssignments(categoryPatches);
    }
    if (vehiclePatches.length) {
      await upsertRiderVehicleTypeServiceAssignments(vehiclePatches);
    }

    const [categoryRows, vehicleRows] = await Promise.all([
      listRiderVehicleCategoryServiceAssignments(),
      listRiderVehicleTypeServiceAssignments(),
    ]);
    return NextResponse.json({ success: true, categoryRows, vehicleRows });
  } catch (e) {
    console.error("[super-admin rider-vehicle-category-service-assignments PUT]", e);
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

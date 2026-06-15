import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { loadSurgeCatalog } from "@/lib/db/operations/rider-surge-admin";
import { previewRiderPayoutBreakdown } from "@/lib/geo/riderPayoutPreview";

export const runtime = "nodejs";

const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);
const serviceSchema = z.enum(["food", "parcel", "ride"]);

const postSchema = z.object({
  service: serviceSchema,
  vehicleType: vehicleSchema.optional().nullable(),
  pickupKm: z.number().nonnegative(),
  dropKm: z.number().nonnegative(),
  waitingMinutes: z.number().nonnegative().optional(),
  riderHasGmitraMax: z.boolean().optional(),
  forceActiveSurgeIds: z.array(z.number().int().positive()).optional(),
  pickupSlabs: z.array(
    z.object({
      id: z.number(),
      minKm: z.number(),
      maxKm: z.number().nullable(),
      baseFare: z.number().nullable(),
      pickupPerKm: z.number(),
      minCharge: z.number().nullable(),
      waitingChargePerMin: z.number().nullable(),
      waitingStartAfter: z.number(),
      priority: z.number(),
    })
  ),
  dropSlabs: z.array(
    z.object({
      id: z.number(),
      minKm: z.number(),
      maxKm: z.number().nullable(),
      dropPerKm: z.number(),
      priority: z.number(),
    })
  ),
});

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

  if (parsed.data.service === "ride" && !parsed.data.vehicleType) {
    return NextResponse.json({ error: "vehicleType required for ride" }, { status: 400 });
  }

  try {
    const catalog = await loadSurgeCatalog();
    const breakdown = previewRiderPayoutBreakdown({
      pickupKm: parsed.data.pickupKm,
      dropKm: parsed.data.dropKm,
      pickupSlabs: parsed.data.pickupSlabs,
      dropSlabs: parsed.data.dropSlabs,
      waitingMinutes: parsed.data.waitingMinutes,
      riderHasGmitraMax: parsed.data.riderHasGmitraMax,
      service: parsed.data.service,
      vehicleType: parsed.data.vehicleType,
      surgeDefinitions: catalog.definitions,
      surgeTimeSlots: catalog.timeSlots,
      surgeWaitMaxOnly: catalog.settings.surgeWaitMaxOnly,
      maxTotalSurgeAmount: catalog.settings.maxTotalSurgeAmount,
      forceActiveSurgeIds: parsed.data.forceActiveSurgeIds,
    });

    return NextResponse.json({
      breakdown,
      settings: catalog.settings,
      availableSurges: catalog.definitions,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Preview failed" }, { status: 500 });
  }
}

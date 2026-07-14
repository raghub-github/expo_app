import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { loadSurgeCatalog } from "@/lib/db/operations/rider-surge-admin";
import {
  mapRiderSurgeDefinitionToPreview,
  mapRiderSurgeTimeSlotToPreview,
} from "@/lib/geo/mapRiderSurgeCatalog";
import { previewServicePayoutBreakdown } from "@/lib/geo/riderPayoutPreview";

export const runtime = "nodejs";

const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);
const serviceSchema = z.enum(["food", "parcel", "ride"]);

const postSchema = z.object({
  service: serviceSchema,
  vehicleType: vehicleSchema.optional().nullable(),
  customerFare: z.number().positive(),
  pickupKm: z.number().nonnegative(),
  dropKm: z.number().nonnegative(),
  waitingMinutes: z.number().nonnegative().optional(),
  riderHasGmitraMax: z.boolean().optional(),
  forceActiveSurgeIds: z.array(z.number().int().positive()).optional(),
  rule: z.object({
    riderPercentage: z.number().gt(0).lte(100),
    platformPercentage: z.number().gte(0).lt(100),
    waitingChargePerMin: z.number().nonnegative().nullable(),
    waitingFreeMinutes: z.number().nonnegative(),
  }),
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
    const surgeDefinitions = catalog.definitions.map(mapRiderSurgeDefinitionToPreview);
    const surgeTimeSlots = catalog.timeSlots.map(mapRiderSurgeTimeSlotToPreview);
    const breakdown = previewServicePayoutBreakdown({
      customerFare: parsed.data.customerFare,
      pickupKm: parsed.data.pickupKm,
      dropKm: parsed.data.dropKm,
      rule: parsed.data.rule,
      waitingMinutes: parsed.data.waitingMinutes,
      riderHasGmitraMax: parsed.data.riderHasGmitraMax,
      service: parsed.data.service,
      vehicleType: parsed.data.vehicleType,
      surgeDefinitions,
      surgeTimeSlots,
      surgeWaitMaxOnly: catalog.settings.surgeWaitMaxOnly,
      maxTotalSurgeAmount: catalog.settings.maxTotalSurgeAmount,
      forceActiveSurgeIds: parsed.data.forceActiveSurgeIds,
    });

    return NextResponse.json({
      breakdown,
      settings: catalog.settings,
      availableSurges: surgeDefinitions,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Preview failed" }, { status: 500 });
  }
}

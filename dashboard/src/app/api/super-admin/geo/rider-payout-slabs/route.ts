import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getEffectiveRiderSlabs,
  insertRiderDropSlab,
  insertRiderPickupSlab,
  listRiderDropSlabs,
  listRiderPickupSlabs,
  type RiderPayoutServiceType,
  type RiderSlabLeg,
  type RideVehiclePricingType,
} from "@/lib/db/operations/rider-payout-slabs-admin";
import { validateDeliveryRateSlabSet } from "@/lib/geo/deliveryRateSlabAdminValidation";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const serviceSchema = z.enum(["food", "parcel", "ride"]);
const legSchema = z.enum(["pickup", "drop"]);
const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);

const postSchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  service: serviceSchema,
  leg: legSchema,
  vehicleType: vehicleSchema.optional().nullable(),
  minKm: z.number().nonnegative(),
  maxKm: z.number().nonnegative().optional().nullable(),
  baseFare: z.number().nonnegative().optional().nullable(),
  pickupPerKm: z.number().nonnegative().optional(),
  dropPerKm: z.number().nonnegative().optional(),
  minCharge: z.number().nonnegative().optional().nullable(),
  waitingChargePerMin: z.number().nonnegative().optional().nullable(),
  waitingStartAfter: z.number().int().nonnegative().optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  const service = serviceSchema.safeParse(sp.get("service"));
  const leg = legSchema.safeParse(sp.get("leg"));
  const vehicleType = sp.get("vehicleType");
  const vehicleParsed = vehicleType ? vehicleSchema.safeParse(vehicleType) : null;

  if (!level.success || !refId || !service.success || !leg.success) {
    return NextResponse.json({ error: "level, refId, service, leg required" }, { status: 400 });
  }
  if (service.data === "ride" && vehicleParsed && !vehicleParsed.success) {
    return NextResponse.json({ error: "invalid vehicleType" }, { status: 400 });
  }

  try {
    const slabs =
      leg.data === "pickup"
        ? await listRiderPickupSlabs({
            level: level.data,
            refId,
            service: service.data,
            vehicleType: vehicleParsed?.success ? vehicleParsed.data : null,
          })
        : await listRiderDropSlabs({
            level: level.data,
            refId,
            service: service.data,
            vehicleType: vehicleParsed?.success ? vehicleParsed.data : null,
          });
    return NextResponse.json({ slabs });
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

  if (parsed.data.service === "ride" && !parsed.data.vehicleType) {
    return NextResponse.json({ error: "vehicleType required for ride service" }, { status: 400 });
  }
  if (parsed.data.maxKm != null && parsed.data.maxKm <= parsed.data.minKm) {
    return NextResponse.json({ error: "maxKm must be > minKm" }, { status: 400 });
  }

  try {
    const existing =
      parsed.data.leg === "pickup"
        ? await listRiderPickupSlabs({
            level: parsed.data.level,
            refId: parsed.data.refId,
            service: parsed.data.service,
            vehicleType: parsed.data.vehicleType as RideVehiclePricingType | null,
          })
        : await listRiderDropSlabs({
            level: parsed.data.level,
            refId: parsed.data.refId,
            service: parsed.data.service,
            vehicleType: parsed.data.vehicleType as RideVehiclePricingType | null,
          });

    const msg = validateDeliveryRateSlabSet([
      ...existing.map((s) => ({ minKm: s.minKm, maxKm: s.maxKm, baseFare: "baseFare" in s ? s.baseFare : null })),
      { minKm: parsed.data.minKm, maxKm: parsed.data.maxKm ?? null, baseFare: parsed.data.baseFare ?? null },
    ]);
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });

    if (parsed.data.leg === "pickup") {
      const slab = await insertRiderPickupSlab({
        level: parsed.data.level,
        refId: parsed.data.refId,
        service: parsed.data.service as RiderPayoutServiceType,
        vehicleType: parsed.data.vehicleType as RideVehiclePricingType | null,
        minKm: parsed.data.minKm,
        maxKm: parsed.data.maxKm ?? null,
        baseFare: parsed.data.baseFare ?? null,
        pickupPerKm: parsed.data.pickupPerKm ?? 0,
        minCharge: parsed.data.minCharge ?? null,
        waitingChargePerMin: parsed.data.waitingChargePerMin ?? null,
        waitingStartAfter: parsed.data.waitingStartAfter,
        priority: parsed.data.priority,
        isActive: parsed.data.isActive,
      });
      return NextResponse.json({ slab });
    }

    const slab = await insertRiderDropSlab({
      level: parsed.data.level,
      refId: parsed.data.refId,
      service: parsed.data.service as RiderPayoutServiceType,
      vehicleType: parsed.data.vehicleType as RideVehiclePricingType | null,
      minKm: parsed.data.minKm,
      maxKm: parsed.data.maxKm ?? null,
      dropPerKm: parsed.data.dropPerKm ?? 0,
      priority: parsed.data.priority,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ slab });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Insert failed" }, { status: 500 });
  }
}

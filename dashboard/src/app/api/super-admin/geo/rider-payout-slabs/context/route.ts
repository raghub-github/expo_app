import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getEffectiveRiderSlabs,
  type RiderPayoutServiceType,
  type RiderSlabLeg,
  type RideVehiclePricingType,
} from "@/lib/db/operations/rider-payout-slabs-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const serviceSchema = z.enum(["food", "parcel", "ride"]);
const legSchema = z.enum(["pickup", "drop"]);
const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);

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

  try {
    const result = await getEffectiveRiderSlabs({
      level: level.data,
      refId,
      service: service.data as RiderPayoutServiceType,
      leg: leg.data as RiderSlabLeg,
      vehicleType: vehicleParsed?.success ? vehicleParsed.data : null,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

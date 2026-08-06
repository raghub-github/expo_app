import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getEffectiveParcelCustomerPricing,
  insertParcelCustomerPricing,
  listParcelCustomerPricing,
  type ParcelVehiclePricingType,
} from "@/lib/db/operations/parcel-customer-pricing-admin";
import { validateDeliveryRateSlabSet } from "@/lib/geo/deliveryRateSlabAdminValidation";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac"]);

const postSchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  vehicleType: vehicleSchema,
  minKm: z.coerce.number().nonnegative(),
  maxKm: z.coerce.number().nonnegative().optional().nullable(),
  baseFare: z.coerce.number().nonnegative().optional().nullable(),
  perKmRate: z.coerce.number().nonnegative(),
  minCharge: z.coerce.number().nonnegative().optional().nullable(),
  priority: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  const vehicleType = vehicleSchema.safeParse(sp.get("vehicleType"));
  const effective = sp.get("effective") === "1";

  if (!level.success || !refId || !vehicleType.success) {
    return NextResponse.json({ error: "level, refId, vehicleType required" }, { status: 400 });
  }

  try {
    if (effective) {
      const result = await getEffectiveParcelCustomerPricing({
        level: level.data,
        refId,
        vehicleType: vehicleType.data,
      });
      return NextResponse.json(result);
    }
    const slabs = await listParcelCustomerPricing({
      level: level.data,
      refId,
      vehicleType: vehicleType.data,
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

  if (parsed.data.maxKm != null && parsed.data.maxKm <= parsed.data.minKm) {
    return NextResponse.json({ error: "maxKm must be > minKm" }, { status: 400 });
  }

  try {
    const existing = await listParcelCustomerPricing({
      level: parsed.data.level,
      refId: parsed.data.refId,
      vehicleType: parsed.data.vehicleType,
    });
    const msg = validateDeliveryRateSlabSet([
      ...existing,
      { minKm: parsed.data.minKm, maxKm: parsed.data.maxKm ?? null, baseFare: parsed.data.baseFare ?? null },
    ]);
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });

    const slab = await insertParcelCustomerPricing({
      level: parsed.data.level,
      refId: parsed.data.refId,
      vehicleType: parsed.data.vehicleType as ParcelVehiclePricingType,
      minKm: parsed.data.minKm,
      maxKm: parsed.data.maxKm ?? null,
      baseFare: parsed.data.baseFare ?? null,
      perKmRate: parsed.data.perKmRate,
      minCharge: parsed.data.minCharge ?? null,
      priority: parsed.data.priority,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ slab });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Insert failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertFallbackPricingSlab,
  listFallbackPricingSlabs,
  type FallbackServiceType,
} from "@/lib/db/operations/fallback-pricing-slabs-admin";
import { validateDeliveryRateSlabSet } from "@/lib/geo/deliveryRateSlabAdminValidation";

export const runtime = "nodejs";

const serviceSchema = z.enum(["food", "parcel", "person_ride"]) satisfies z.ZodType<FallbackServiceType>;
const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);

const postSchema = z.object({
  serviceType: serviceSchema,
  vehicleType: vehicleSchema.optional().nullable(),
  minKm: z.number().nonnegative(),
  maxKm: z.number().nonnegative().optional().nullable(),
  baseFare: z.number().nonnegative().optional().nullable(),
  perKmRate: z.number().nonnegative(),
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
  const serviceParsed = serviceSchema.safeParse(sp.get("serviceType"));
  if (!serviceParsed.success) {
    return NextResponse.json({ error: "serviceType required (food|parcel|person_ride)" }, { status: 400 });
  }

  const vehicleRaw = sp.get("vehicleType");
  const vehicleParsed = vehicleRaw ? vehicleSchema.safeParse(vehicleRaw) : null;
  if (vehicleParsed && !vehicleParsed.success) {
    return NextResponse.json({ error: "invalid vehicleType" }, { status: 400 });
  }

  try {
    const slabs = await listFallbackPricingSlabs({
      serviceType: serviceParsed.data,
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

  if (parsed.data.serviceType === "person_ride" && !parsed.data.vehicleType) {
    return NextResponse.json({ error: "vehicleType required for ride fallback" }, { status: 400 });
  }
  if (parsed.data.maxKm != null && parsed.data.maxKm <= parsed.data.minKm) {
    return NextResponse.json({ error: "maxKm must be > minKm" }, { status: 400 });
  }
  if (parsed.data.baseFare != null && parsed.data.baseFare > 0 && parsed.data.minKm !== 0) {
    return NextResponse.json({ error: "baseFare allowed only for minKm=0" }, { status: 400 });
  }

  try {
    const existing = await listFallbackPricingSlabs({
      serviceType: parsed.data.serviceType,
      vehicleType: parsed.data.vehicleType ?? null,
    });
    const msg = validateDeliveryRateSlabSet([
      ...existing,
      { minKm: parsed.data.minKm, maxKm: parsed.data.maxKm ?? null, baseFare: parsed.data.baseFare ?? null },
    ]);
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });

    const slab = await insertFallbackPricingSlab({
      serviceType: parsed.data.serviceType,
      vehicleType: parsed.data.vehicleType ?? null,
      minKm: parsed.data.minKm,
      maxKm: parsed.data.maxKm ?? null,
      baseFare: parsed.data.baseFare ?? null,
      perKmRate: parsed.data.perKmRate,
      minCharge: parsed.data.minCharge ?? null,
      waitingChargePerMin: parsed.data.waitingChargePerMin ?? null,
      waitingStartAfter: parsed.data.waitingStartAfter,
      priority: parsed.data.priority,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ slab });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Insert failed" }, { status: 500 });
  }
}

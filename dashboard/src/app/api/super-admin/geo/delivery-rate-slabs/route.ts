import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertDeliveryRateSlab,
  listDeliveryRateSlabs,
  type DeliveryActorType,
  type DeliveryServiceType,
} from "@/lib/db/operations/delivery-rate-slabs-admin";
import { validateDeliveryRateSlabSet } from "@/lib/geo/deliveryRateSlabAdminValidation";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const actorSchema = z.enum(["customer", "rider"]) satisfies z.ZodType<DeliveryActorType>;
const serviceSchema = z.enum(["food", "parcel", "person_ride"]) satisfies z.ZodType<DeliveryServiceType>;

const postSchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  serviceType: serviceSchema,
  actorType: actorSchema,
  minKm: z.number().nonnegative(),
  maxKm: z.number().nonnegative().optional().nullable(),
  baseFare: z.number().nonnegative().optional().nullable(),
  perKmRate: z.number().nonnegative(),
  minCharge: z.number().nonnegative().optional().nullable(),
  waitingChargePerMin: z.number().nonnegative().optional().nullable(),
  surgeMultiplier: z.number().optional().nullable(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  if (!level.success || !refId) return NextResponse.json({ error: "level and refId required" }, { status: 400 });

  const serviceType = sp.get("serviceType");
  const actorType = sp.get("actorType");
  const serviceParsed = serviceType ? serviceSchema.safeParse(serviceType) : null;
  const actorParsed = actorType ? actorSchema.safeParse(actorType) : null;
  if (serviceParsed && !serviceParsed.success) return NextResponse.json({ error: "invalid serviceType" }, { status: 400 });
  if (actorParsed && !actorParsed.success) return NextResponse.json({ error: "invalid actorType" }, { status: 400 });

  try {
    const slabs = await listDeliveryRateSlabs({
      level: level.data,
      refId,
      serviceType: serviceParsed?.success ? serviceParsed.data : undefined,
      actorType: actorParsed?.success ? actorParsed.data : undefined,
    });
    return NextResponse.json({ slabs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list slabs";
    return NextResponse.json({ error: msg }, { status: 500 });
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
  if (parsed.data.baseFare != null && parsed.data.baseFare > 0 && parsed.data.minKm !== 0) {
    return NextResponse.json({ error: "baseFare allowed only for minKm=0" }, { status: 400 });
  }
  if (parsed.data.surgeMultiplier != null && parsed.data.surgeMultiplier < 1) {
    return NextResponse.json({ error: "surgeMultiplier must be >= 1" }, { status: 400 });
  }

  try {
    // Enforce: if you override at this node, you must define a complete non-overlapping slab set.
    const existing = await listDeliveryRateSlabs({
      level: parsed.data.level,
      refId: parsed.data.refId,
      serviceType: parsed.data.serviceType,
      actorType: parsed.data.actorType,
    });
    const candidate = {
      minKm: parsed.data.minKm,
      maxKm: parsed.data.maxKm ?? null,
      baseFare: parsed.data.baseFare ?? null,
    };
    const msg = validateDeliveryRateSlabSet([...existing, candidate]);
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });

    const slab = await insertDeliveryRateSlab({
      level: parsed.data.level,
      refId: parsed.data.refId,
      serviceType: parsed.data.serviceType,
      actorType: parsed.data.actorType,
      minKm: parsed.data.minKm,
      maxKm: parsed.data.maxKm ?? null,
      baseFare: parsed.data.baseFare ?? null,
      perKmRate: parsed.data.perKmRate,
      minCharge: parsed.data.minCharge ?? null,
      waitingChargePerMin: parsed.data.waitingChargePerMin ?? null,
      surgeMultiplier: parsed.data.surgeMultiplier ?? null,
      priority: parsed.data.priority,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ slab });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Insert failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


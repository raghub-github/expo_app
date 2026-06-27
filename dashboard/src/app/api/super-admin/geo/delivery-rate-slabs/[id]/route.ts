import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteDeliveryRateSlab,
  getDeliveryRateSlabById,
  listDeliveryRateSlabs,
  updateDeliveryRateSlab,
} from "@/lib/db/operations/delivery-rate-slabs-admin";
import { validateDeliveryRateSlabSet } from "@/lib/geo/deliveryRateSlabAdminValidation";

export const runtime = "nodejs";

const patchSchema = z.object({
  minKm: z.coerce.number().nonnegative().optional(),
  maxKm: z.coerce.number().nonnegative().nullable().optional(),
  baseFare: z.coerce.number().nonnegative().nullable().optional(),
  perKmRate: z.coerce.number().nonnegative().optional(),
  minCharge: z.coerce.number().nonnegative().nullable().optional(),
  waitingChargePerMin: z.coerce.number().nonnegative().nullable().optional(),
  surgeMultiplier: z.coerce.number().nullable().optional(),
  priority: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const slabId = Number(id);
  if (!Number.isInteger(slabId) || slabId < 1) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.baseFare != null && parsed.data.baseFare > 0 && parsed.data.minKm != null && parsed.data.minKm !== 0) {
    return NextResponse.json({ error: "baseFare allowed only for minKm=0" }, { status: 400 });
  }
  if (parsed.data.maxKm != null && parsed.data.minKm != null && parsed.data.maxKm <= parsed.data.minKm) {
    return NextResponse.json({ error: "maxKm must be > minKm" }, { status: 400 });
  }
  if (parsed.data.surgeMultiplier != null && parsed.data.surgeMultiplier < 1) {
    return NextResponse.json({ error: "surgeMultiplier must be >= 1" }, { status: 400 });
  }

  try {
    const current = await getDeliveryRateSlabById(slabId);
    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
    const existing = await listDeliveryRateSlabs({
      level: current.geoLevel,
      refId: current.geoRefId,
      serviceType: current.serviceType,
      actorType: current.actorType,
    });
    const next = existing.map((s) => {
      if (s.id !== slabId) return { minKm: s.minKm, maxKm: s.maxKm, baseFare: s.baseFare };
      const nextMin = parsed.data.minKm ?? s.minKm;
      const nextMax = parsed.data.maxKm === undefined ? s.maxKm : parsed.data.maxKm;
      const nextBase = parsed.data.baseFare === undefined ? s.baseFare : parsed.data.baseFare;
      return { minKm: nextMin, maxKm: nextMax, baseFare: nextBase };
    });
    const msg = validateDeliveryRateSlabSet(next);
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });

    const merged = {
      minKm: parsed.data.minKm ?? current.minKm,
      maxKm: parsed.data.maxKm === undefined ? current.maxKm : parsed.data.maxKm,
      baseFare: parsed.data.baseFare === undefined ? current.baseFare : parsed.data.baseFare,
      perKmRate: parsed.data.perKmRate ?? current.perKmRate,
      minCharge: parsed.data.minCharge === undefined ? current.minCharge : parsed.data.minCharge,
      waitingChargePerMin:
        parsed.data.waitingChargePerMin === undefined
          ? current.waitingChargePerMin
          : parsed.data.waitingChargePerMin,
      surgeMultiplier:
        parsed.data.surgeMultiplier === undefined ? current.surgeMultiplier : parsed.data.surgeMultiplier,
      priority: parsed.data.priority ?? current.priority,
      isActive: parsed.data.isActive ?? current.isActive,
    };

    const updated = await updateDeliveryRateSlab(slabId, merged);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ slab: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const slabId = Number(id);
  if (!Number.isInteger(slabId) || slabId < 1) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    const ok = await deleteDeliveryRateSlab(slabId);
    return NextResponse.json({ ok });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


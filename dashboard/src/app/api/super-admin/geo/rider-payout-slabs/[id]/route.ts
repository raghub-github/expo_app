import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getRiderDropSlabById,
  getRiderPickupSlabById,
  listRiderDropSlabs,
  listRiderPickupSlabs,
  softDeleteRiderSlab,
  updateRiderDropSlab,
  updateRiderPickupSlab,
  type RiderPayoutServiceType,
  type RiderSlabLeg,
} from "@/lib/db/operations/rider-payout-slabs-admin";
import { validateDeliveryRateSlabSet } from "@/lib/geo/deliveryRateSlabAdminValidation";

export const runtime = "nodejs";

const serviceSchema = z.enum(["food", "parcel", "ride"]);
const legSchema = z.enum(["pickup", "drop"]);

const patchSchema = z.object({
  service: serviceSchema,
  leg: legSchema,
  minKm: z.number().nonnegative().optional(),
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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const service = parsed.data.service as RiderPayoutServiceType;
  const leg = parsed.data.leg as RiderSlabLeg;

  try {
    if (leg === "pickup") {
      const current = await getRiderPickupSlabById(service, id);
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const merged = {
        minKm: parsed.data.minKm ?? current.minKm,
        maxKm: parsed.data.maxKm === undefined ? current.maxKm : parsed.data.maxKm,
        baseFare: parsed.data.baseFare === undefined ? current.baseFare : parsed.data.baseFare,
        pickupPerKm: parsed.data.pickupPerKm ?? current.pickupPerKm,
        minCharge: parsed.data.minCharge === undefined ? current.minCharge : parsed.data.minCharge,
        waitingChargePerMin:
          parsed.data.waitingChargePerMin === undefined
            ? current.waitingChargePerMin
            : parsed.data.waitingChargePerMin,
        waitingStartAfter: parsed.data.waitingStartAfter ?? current.waitingStartAfter,
        priority: parsed.data.priority ?? current.priority,
        isActive: parsed.data.isActive ?? current.isActive,
      };

      if (merged.maxKm != null && merged.maxKm <= merged.minKm) {
        return NextResponse.json({ error: "maxKm must be > minKm" }, { status: 400 });
      }
      if ((merged.baseFare ?? 0) > 0 && merged.minKm !== 0) {
        return NextResponse.json({ error: "baseFare allowed only for minKm=0" }, { status: 400 });
      }

      const existing = await listRiderPickupSlabs({
        level: current.geoLevel,
        refId: current.geoRefId,
        service,
        vehicleType: current.vehicleType ?? null,
      });
      const next = existing.map((s) =>
        s.id === id
          ? { minKm: merged.minKm, maxKm: merged.maxKm, baseFare: merged.baseFare }
          : { minKm: s.minKm, maxKm: s.maxKm, baseFare: s.baseFare }
      );
      const msg = validateDeliveryRateSlabSet(next);
      if (msg) return NextResponse.json({ error: msg }, { status: 400 });

      const slab = await updateRiderPickupSlab(service, id, merged);
      if (!slab) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ slab });
    }

    const current = await getRiderDropSlabById(service, id);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const merged = {
      minKm: parsed.data.minKm ?? current.minKm,
      maxKm: parsed.data.maxKm === undefined ? current.maxKm : parsed.data.maxKm,
      dropPerKm: parsed.data.dropPerKm ?? current.dropPerKm,
      priority: parsed.data.priority ?? current.priority,
      isActive: parsed.data.isActive ?? current.isActive,
    };

    if (merged.maxKm != null && merged.maxKm <= merged.minKm) {
      return NextResponse.json({ error: "maxKm must be > minKm" }, { status: 400 });
    }

    const existing = await listRiderDropSlabs({
      level: current.geoLevel,
      refId: current.geoRefId,
      service,
      vehicleType: current.vehicleType ?? null,
    });
    const next = existing.map((s) =>
      s.id === id
        ? { minKm: merged.minKm, maxKm: merged.maxKm, baseFare: null }
        : { minKm: s.minKm, maxKm: s.maxKm, baseFare: null }
    );
    const msg = validateDeliveryRateSlabSet(next);
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });

    const slab = await updateRiderDropSlab(service, id, merged);
    if (!slab) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ slab });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const service = serviceSchema.safeParse(sp.get("service"));
  const leg = legSchema.safeParse(sp.get("leg"));
  if (!service.success || !leg.success) {
    return NextResponse.json({ error: "service and leg query params required" }, { status: 400 });
  }

  try {
    const ok = await softDeleteRiderSlab(
      service.data as RiderPayoutServiceType,
      leg.data as RiderSlabLeg,
      id
    );
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}

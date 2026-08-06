import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getParcelCustomerPricingById,
  listParcelCustomerPricing,
  softDeleteParcelCustomerPricing,
  updateParcelCustomerPricing,
} from "@/lib/db/operations/parcel-customer-pricing-admin";
import { validateDeliveryRateSlabSet } from "@/lib/geo/deliveryRateSlabAdminValidation";

export const runtime = "nodejs";

const patchSchema = z.object({
  minKm: z.coerce.number().nonnegative().optional(),
  maxKm: z.coerce.number().nonnegative().optional().nullable(),
  baseFare: z.coerce.number().nonnegative().optional().nullable(),
  perKmRate: z.coerce.number().nonnegative().optional(),
  minCharge: z.coerce.number().nonnegative().optional().nullable(),
  priority: z.coerce.number().int().optional(),
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
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  try {
    const current = await getParcelCustomerPricingById(id);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const merged = {
      minKm: parsed.data.minKm ?? current.minKm,
      maxKm: parsed.data.maxKm === undefined ? current.maxKm : parsed.data.maxKm,
      baseFare: parsed.data.baseFare === undefined ? current.baseFare : parsed.data.baseFare,
      perKmRate: parsed.data.perKmRate ?? current.perKmRate,
      minCharge: parsed.data.minCharge === undefined ? current.minCharge : parsed.data.minCharge,
      priority: parsed.data.priority ?? current.priority,
      isActive: parsed.data.isActive ?? current.isActive,
    };

    if (merged.maxKm != null && merged.maxKm <= merged.minKm) {
      return NextResponse.json({ error: "maxKm must be > minKm" }, { status: 400 });
    }
    if ((merged.baseFare ?? 0) > 0 && merged.minKm !== 0) {
      return NextResponse.json({ error: "baseFare allowed only for minKm=0" }, { status: 400 });
    }

    const existing = await listParcelCustomerPricing({
      level: current.geoLevel,
      refId: current.geoRefId,
      vehicleType: current.vehicleType,
    });
    const next = existing.map((s) =>
      s.id === id
        ? { minKm: merged.minKm, maxKm: merged.maxKm, baseFare: merged.baseFare }
        : { minKm: s.minKm, maxKm: s.maxKm, baseFare: s.baseFare }
    );
    const msg = validateDeliveryRateSlabSet(next);
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });

    const slab = await updateParcelCustomerPricing(id, merged);
    if (!slab) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ slab });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    const ok = await softDeleteParcelCustomerPricing(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}

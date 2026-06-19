import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  softDeleteRiderSlab,
  updateRiderDropSlab,
  updateRiderPickupSlab,
  type RiderPayoutServiceType,
  type RiderSlabLeg,
} from "@/lib/db/operations/rider-payout-slabs-admin";

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

  try {
    const slab =
      parsed.data.leg === "pickup"
        ? await updateRiderPickupSlab(parsed.data.service as RiderPayoutServiceType, id, parsed.data)
        : await updateRiderDropSlab(parsed.data.service as RiderPayoutServiceType, id, parsed.data);
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

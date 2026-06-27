import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  softDeleteFallbackPricingSlab,
  updateFallbackPricingSlab,
} from "@/lib/db/operations/fallback-pricing-slabs-admin";

export const runtime = "nodejs";

const patchSchema = z.object({
  minKm: z.number().nonnegative().optional(),
  maxKm: z.number().nonnegative().optional().nullable(),
  baseFare: z.number().nonnegative().optional().nullable(),
  perKmRate: z.number().nonnegative().optional(),
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
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  try {
    const slab = await updateFallbackPricingSlab(id, parsed.data);
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
    const ok = await softDeleteFallbackPricingSlab(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}

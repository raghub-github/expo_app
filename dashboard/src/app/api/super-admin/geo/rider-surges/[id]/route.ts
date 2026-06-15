import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteSurgeDefinition,
  getSurgeDefinition,
  updateSurgeDefinition,
} from "@/lib/db/operations/rider-surge-admin";

export const runtime = "nodejs";

const kindSchema = z.enum(["peak_hour", "rain", "festival", "custom"]);

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  kind: kindSchema.optional(),
  fixedAmount: z.number().nonnegative().optional(),
  priority: z.number().int().nonnegative().optional(),
  isEnabled: z.boolean().optional(),
  gmitraMaxOnly: z.boolean().optional(),
  appliesFood: z.boolean().optional(),
  appliesParcel: z.boolean().optional(),
  appliesRide: z.boolean().optional(),
  vehicle2Wheeler: z.boolean().optional(),
  vehicle3Wheeler: z.boolean().optional(),
  vehicle4WheelerAc: z.boolean().optional(),
  vehicle4WheelerNonAc: z.boolean().optional(),
  manualActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

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

  try {
    const existing = await getSurgeDefinition(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const surge = await updateSurgeDefinition(id, parsed.data);
    return NextResponse.json({ surge });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const ok = await deleteSurgeDefinition(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}

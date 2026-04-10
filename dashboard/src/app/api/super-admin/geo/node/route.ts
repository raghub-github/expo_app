import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { geoSoftDelete, geoUpdateLocation } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);

const patchSchema = z.object({
  level: levelSchema,
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  branchType: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

const deleteSchema = z.object({
  level: levelSchema,
  id: z.string().uuid(),
});

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

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
    await geoUpdateLocation(parsed.data.level, parsed.data.id, {
      name: parsed.data.name,
      branchType: parsed.data.branchType,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await geoSoftDelete(parsed.data.level, parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

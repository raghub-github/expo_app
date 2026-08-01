import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PREVENT_SERVICE_CODES } from "@/lib/db/operations/prevent-services-shared";
import {
  deletePreventServiceRule,
  getPreventServiceRule,
  updatePreventServiceRule,
} from "@/lib/db/operations/prevent-services-admin";

export const runtime = "nodejs";

const serviceCodeSchema = z.enum(PREVENT_SERVICE_CODES);

const putSchema = z.object({
  searchType: z.enum(["flat_search", "lat_lng"]),
  placeId: z.string().max(256).optional().nullable(),
  locationName: z.string().min(1).max(240),
  address: z.string().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(50).max(100_000),
  blockedServices: z.array(serviceCodeSchema).min(1),
  reason: z.string().max(120).optional().nullable(),
  reasonCustom: z.string().max(500).optional().nullable(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  status: z.enum(["active", "paused"]).optional(),
});

async function actor() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return {
    adminId: user?.id ?? null,
    adminName: user?.user_metadata?.full_name || user?.email || null,
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  try {
    const rule = await getPreventServiceRule(id);
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const who = await actor();
    const rule = await updatePreventServiceRule(id, {
      ...parsed.data,
      adminId: who.adminId,
      adminName: who.adminName,
    });
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    const status =
      e && typeof e === "object" && "statusCode" in e
        ? Number((e as { statusCode?: number }).statusCode) || 500
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  let reason: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.reason === "string") reason = body.reason;
  } catch {
    /* optional body */
  }
  try {
    const who = await actor();
    await deletePreventServiceRule({
      id,
      adminId: who.adminId,
      adminName: who.adminName,
      reason,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    const status =
      e && typeof e === "object" && "statusCode" in e
        ? Number((e as { statusCode?: number }).statusCode) || 500
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

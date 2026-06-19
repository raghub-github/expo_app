import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteStateSurgeTimeSlot,
  insertStateSurgeTimeSlot,
  listStateSurgeTimeSlots,
  updateStateSurgeTimeSlot,
} from "@/lib/db/operations/state-surge-admin";

export const runtime = "nodejs";

const postSchema = z.object({
  stateSurgeId: z.number().int().positive(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  isEnabled: z.boolean().optional(),
});

const patchSchema = z.object({
  id: z.number().int().positive(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  isEnabled: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const stateSurgeId = Number(req.nextUrl.searchParams.get("stateSurgeId"));
  try {
    const timeSlots = await listStateSurgeTimeSlots(
      Number.isFinite(stateSurgeId) ? stateSurgeId : undefined
    );
    return NextResponse.json({ timeSlots });
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

  try {
    const slot = await insertStateSurgeTimeSlot({
      stateSurgeId: parsed.data.stateSurgeId,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      daysOfWeek: parsed.data.daysOfWeek,
      isEnabled: parsed.data.isEnabled,
    });
    return NextResponse.json({ slot });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Insert failed" }, { status: 500 });
  }
}

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
    const slot = await updateStateSurgeTimeSlot(parsed.data.id, parsed.data);
    if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ slot });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const ok = await deleteStateSurgeTimeSlot(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}

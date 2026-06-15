import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";
import {
  assertUniqueStateSurgePriority,
  deleteStateSurge,
  updateStateSurge,
} from "@/lib/db/operations/state-surge-admin";
import { isDefaultStateSurgeName } from "@/lib/geo/ride-state-config-shared";

export const runtime = "nodejs";

const vehicleSchema = z.enum(["all", "2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);
const surgeTypeSchema = z.enum(["fixed", "percentage"]);

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  surgeType: surgeTypeSchema.optional(),
  amount: z.number().nonnegative().optional(),
  vehicleType: vehicleSchema.optional(),
  appliesFood: z.boolean().optional(),
  appliesParcel: z.boolean().optional(),
  appliesRide: z.boolean().optional(),
  maxRidersOnly: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
  manualActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

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

  if (parsed.data.surgeType === "percentage" && parsed.data.amount != null && parsed.data.amount > 100) {
    return NextResponse.json({ error: "Percentage surge cannot exceed 100" }, { status: 400 });
  }

  try {
    if (parsed.data.priority != null) {
      const sql = getSql();
      const rows = await sql<{ state_id: string }[]>`
        SELECT state_id::text AS state_id FROM state_surge_configs WHERE id = ${id} LIMIT 1
      `;
      const stateId = rows[0]?.state_id;
      if (stateId) {
        await assertUniqueStateSurgePriority(stateId, parsed.data.priority, id);
      }
    }
    const surge = await updateStateSurge(id, parsed.data);
    if (!surge) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const sql = getSql();
    const rows = await sql<{ name: string }[]>`
      SELECT name FROM state_surge_configs WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
    `;
    const name = rows[0]?.name;
    if (name && isDefaultStateSurgeName(name)) {
      return NextResponse.json({ error: "Built-in surge rules cannot be deleted" }, { status: 400 });
    }
    const ok = await deleteStateSurge(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}

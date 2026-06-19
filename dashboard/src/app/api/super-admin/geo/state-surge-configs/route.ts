import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  assertUniqueStateSurgePriority,
  deleteStateSurge,
  ensureStateSurgeDefaults,
  ensureStateSurgeTimeSlots,
  insertStateSurge,
  loadStateSurgeCatalog,
  updateStateSurge,
} from "@/lib/db/operations/state-surge-admin";

export const runtime = "nodejs";

const vehicleSchema = z.enum(["all", "2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);
const surgeTypeSchema = z.enum(["fixed", "percentage"]);

const postSchema = z.object({
  stateId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  surgeType: surgeTypeSchema.optional(),
  amount: z.number().nonnegative(),
  vehicleType: vehicleSchema.optional(),
  appliesFood: z.boolean().optional(),
  appliesParcel: z.boolean().optional(),
  appliesRide: z.boolean().optional(),
  maxRidersOnly: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
  manualActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const stateId = req.nextUrl.searchParams.get("stateId");
  if (!stateId) return NextResponse.json({ error: "stateId required" }, { status: 400 });

  try {
    await ensureStateSurgeDefaults(stateId);
    await ensureStateSurgeTimeSlots(stateId);
    const catalog = await loadStateSurgeCatalog(stateId);
    return NextResponse.json(catalog);
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

  if (parsed.data.surgeType === "percentage" && parsed.data.amount > 100) {
    return NextResponse.json({ error: "Percentage surge cannot exceed 100" }, { status: 400 });
  }

  const appliesFood = parsed.data.appliesFood ?? true;
  const appliesParcel = parsed.data.appliesParcel ?? true;
  const appliesRide = parsed.data.appliesRide ?? true;
  if (!appliesFood && !appliesParcel && !appliesRide) {
    return NextResponse.json({ error: "Enable at least one service (Food, Parcel, or Ride)" }, { status: 400 });
  }

  try {
    const priority = parsed.data.priority ?? 100;
    await assertUniqueStateSurgePriority(parsed.data.stateId, priority);
    const surge = await insertStateSurge(parsed.data);
    return NextResponse.json({ surge });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Insert failed" }, { status: 500 });
  }
}

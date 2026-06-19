import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertSurgeDefinition,
  listSurgeDefinitions,
  listSurgeTimeSlots,
  getSurgeSettings,
  loadSurgeCatalog,
} from "@/lib/db/operations/rider-surge-admin";

export const runtime = "nodejs";

const kindSchema = z.enum(["peak_hour", "rain", "festival", "custom"]);

const postSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  kind: kindSchema.optional(),
  fixedAmount: z.number().nonnegative(),
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

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const catalog = await loadSurgeCatalog();
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

  const hasService =
    parsed.data.appliesFood || parsed.data.appliesParcel || parsed.data.appliesRide;
  if (!hasService) {
    return NextResponse.json({ error: "At least one service (food/parcel/ride) must be selected" }, { status: 400 });
  }

  try {
    const surge = await insertSurgeDefinition(parsed.data);
    const timeSlots = await listSurgeTimeSlots(surge.id);
    const settings = await getSurgeSettings();
    return NextResponse.json({ surge, timeSlots, settings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Insert failed" }, { status: 500 });
  }
}

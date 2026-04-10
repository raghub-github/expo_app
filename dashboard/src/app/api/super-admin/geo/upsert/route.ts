import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { geoUpsertLocation } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  state: z.string().min(1),
  region: z.string().min(1),
  district: z.string().min(1),
  division: z.string().min(1),
  postOffice: z.string().min(1),
  pincode: z.string().min(1),
  branchType: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  isFood: z.boolean().optional(),
  isParcel: z.boolean().optional(),
  isRide: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await geoUpsertLocation({
      state: parsed.data.state,
      region: parsed.data.region,
      district: parsed.data.district,
      division: parsed.data.division,
      postOffice: parsed.data.postOffice,
      pincode: parsed.data.pincode,
      branchType: parsed.data.branchType,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      isFood: parsed.data.isFood,
      isParcel: parsed.data.isParcel,
      isRide: parsed.data.isRide,
    });
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upsert failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

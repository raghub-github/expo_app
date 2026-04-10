import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { resolveRiderPayoutDb } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

const querySchema = z.object({
  pincode: z.string().min(3).max(12),
  service: z.enum(["food", "parcel", "ride"]),
  distanceKm: z.coerce.number().finite().min(0),
  waitingMin: z.coerce.number().finite().min(0).optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    pincode: sp.get("pincode") ?? "",
    service: sp.get("service") ?? "",
    distanceKm: sp.get("distanceKm") ?? sp.get("distance_km"),
    waitingMin: sp.get("waitingMin") ?? sp.get("waiting_min"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await resolveRiderPayoutDb({
      pincode: parsed.data.pincode,
      service: parsed.data.service,
      distanceKm: parsed.data.distanceKm,
      waitingMin: parsed.data.waitingMin,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resolve failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

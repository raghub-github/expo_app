import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getEffectiveDeliveryRateSlabs } from "@/lib/db/operations/delivery-rate-slabs-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const actorSchema = z.enum(["customer", "rider"]);
const serviceSchema = z.enum(["food", "parcel", "person_ride"]);

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  const serviceType = serviceSchema.safeParse(sp.get("serviceType"));
  const actorType = actorSchema.safeParse(sp.get("actorType"));

  if (!level.success || !refId || !z.string().uuid().safeParse(refId).success) {
    return NextResponse.json({ error: "level and refId (uuid) required" }, { status: 400 });
  }
  if (!serviceType.success || !actorType.success) {
    return NextResponse.json({ error: "serviceType and actorType required" }, { status: 400 });
  }

  try {
    const effective = await getEffectiveDeliveryRateSlabs({
      level: level.data,
      refId,
      serviceType: serviceType.data,
      actorType: actorType.data,
    });
    return NextResponse.json(effective);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to resolve slabs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


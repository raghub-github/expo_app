import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getEffectiveServicePayoutRule,
  type RiderPayoutServiceType,
} from "@/lib/db/operations/service-payout-rules-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const serviceSchema = z.enum(["food", "parcel", "ride"]);

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  const service = serviceSchema.safeParse(sp.get("service"));

  if (!level.success || !refId || !service.success) {
    return NextResponse.json({ error: "level, refId, service required" }, { status: 400 });
  }

  try {
    const result = await getEffectiveServicePayoutRule({
      level: level.data,
      refId,
      service: service.data as RiderPayoutServiceType,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

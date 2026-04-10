import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { geoGetAncestorChainAsChildRows } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  if (!level.success || !refId || !z.string().uuid().safeParse(refId).success) {
    return NextResponse.json({ error: "level and refId (uuid) required" }, { status: 400 });
  }

  try {
    const chain = await geoGetAncestorChainAsChildRows(level.data, refId);
    return NextResponse.json({ chain });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load chain";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

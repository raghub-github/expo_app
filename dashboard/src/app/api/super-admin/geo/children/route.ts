import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { geoGetChildren } from "@/lib/db/operations/geo-admin";
import type { GeoHierarchyLevel } from "@/lib/geo/geo-shared";

export const runtime = "nodejs";

const levelSchema = z.enum(["root", "state", "region", "district", "division", "post_office", "pincode"]);

function parseBool(v: string | null): boolean | null {
  if (v === null || v === "") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const parentLevel = levelSchema.safeParse(sp.get("parentLevel"));
  if (!parentLevel.success) {
    return NextResponse.json({ error: "Invalid parentLevel" }, { status: 400 });
  }

  try {
    const rows = await geoGetChildren({
      parentLevel: parentLevel.data as GeoHierarchyLevel,
      parentId: sp.get("parentId"),
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      afterName: sp.get("afterName"),
      afterId: sp.get("afterId"),
      stateId: sp.get("stateId"),
      food: parseBool(sp.get("food")),
      parcel: parseBool(sp.get("parcel")),
      ride: parseBool(sp.get("ride")),
    });
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load children";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

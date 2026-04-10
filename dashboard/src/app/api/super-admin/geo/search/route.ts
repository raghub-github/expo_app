import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { geoSearchLocations } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

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
  const q = sp.get("q") ?? "";
  if (q.trim().length < 1) {
    return NextResponse.json({ rows: [] });
  }

  const typesRaw = sp.get("types");
  const types = typesRaw ? typesRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  try {
    const rows = await geoSearchLocations({
      query: q,
      types,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      afterSort: sp.get("afterSort"),
      afterId: sp.get("afterId"),
      stateId: sp.get("stateId"),
      food: parseBool(sp.get("food")),
      parcel: parseBool(sp.get("parcel")),
      ride: parseBool(sp.get("ride")),
    });
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

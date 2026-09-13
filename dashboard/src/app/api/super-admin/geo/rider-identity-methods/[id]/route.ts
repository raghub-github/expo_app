import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { softDeleteRiderGeoIdentityMethods } from "@/lib/db/operations/rider-geo-identity-methods-admin";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = z.coerce.number().int().positive().safeParse(idRaw);
  if (!id.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const ok = await softDeleteRiderGeoIdentityMethods(id.data);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

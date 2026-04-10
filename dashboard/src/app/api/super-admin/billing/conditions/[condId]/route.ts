import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { deleteBillingCondition } from "@/lib/db/operations/billing-admin";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ condId: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { condId: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const ok = await deleteBillingCondition(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

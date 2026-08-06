import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { deleteGeoPlatformOfferBinding } from "@/lib/db/operations/geo-admin";
import { auditPlatformOfferMutation } from "@/lib/audit/platform-offer-audit";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid binding id" }, { status: 400 });
  }

  try {
    const ok = await deleteGeoPlatformOfferBinding(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await auditPlatformOfferMutation(req, "DELETE", {
      resourceType: "geo_platform_offer_binding",
      resourceId: String(id),
      actionDetails: { action: "unmap_platform_offer" },
      previousValues: { binding_id: id },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    await auditPlatformOfferMutation(req, "DELETE", {
      resourceType: "geo_platform_offer_binding",
      resourceId: String(id),
      failed: true,
      errorMessage: msg,
      actionDetails: { action: "unmap_platform_offer" },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

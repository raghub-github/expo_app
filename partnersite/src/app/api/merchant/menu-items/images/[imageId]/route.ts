/**
 * DELETE /api/merchant/menu-items/images/[imageId]?storeId=XXX
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { deleteItemImage } from "@/lib/merchant-menu-item-images";
import { logStoreActivity } from "@/lib/store-activity-feed";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  try {
    const supabaseServer = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error ?? "Merchant not found" }, { status: 403 });
    }

    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const imageId = parseInt((await params).imageId, 10);
    if (!Number.isFinite(imageId)) {
      return NextResponse.json({ error: "invalid_image_id" }, { status: 400 });
    }

    const ok = await deleteItemImage(imageId, access.storeIdNum);
    if (!ok) {
      return NextResponse.json({ error: "image_not_found" }, { status: 404 });
    }

    try {
      await logStoreActivity({
        storeId: access.storeIdNum,
        section: "menu_item",
        action: "delete",
        entityId: imageId,
        summary: `Partner deleted image #${imageId}`,
        actorType: "merchant",
      });
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[menu-items/images DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}

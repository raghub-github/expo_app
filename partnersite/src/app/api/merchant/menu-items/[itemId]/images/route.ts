/**
 * POST /api/merchant/menu-items/[itemId]/images?storeId=XXX
 * Item-scoped image upload (matches merchant app /v1/merchant-menu/items/:id/images).
 *
 * Platform staff (Admin / SuperAdmin / Support / Manager) uploads apply live.
 * Merchant uploads stay PENDING and trigger item re-review.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { assertStoreAccess, isPlatformStaffEmail } from "@/lib/auth/assert-store-access";
import { buildMenuItemImageKey } from "@/lib/merchant-menu-r2-paths";
import { addItemImageRow, setItemPendingForReReview } from "@/lib/merchant-menu-item-images";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import { validateMenuItemSquareImage } from "@/lib/menuItemImageValidation";
import { logStoreActivity } from "@/lib/store-activity-feed";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
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

    const isStaff = await isPlatformStaffEmail(user.email ?? null);
    if (!isStaff) {
      const validation = await validateMerchantFromSession({
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
      });
      if (!validation.isValid) {
        return NextResponse.json({ error: validation.error ?? "Merchant not found" }, { status: 403 });
      }
    }

    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const menuItemId = parseInt((await params).itemId, 10);
    if (!Number.isFinite(menuItemId)) {
      return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
    }

    const { data: itemRow } = await supabase
      .from("merchant_menu_items")
      .select("id, item_id")
      .eq("id", menuItemId)
      .eq("store_id", access.storeIdNum)
      .single();

    if (!itemRow) {
      return NextResponse.json({ error: "item_not_found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ab = await file.arrayBuffer();
    const buffer = Buffer.from(ab);
    const dim = validateMenuItemSquareImage(buffer);
    if (!dim.ok) {
      return NextResponse.json({ error: dim.error, message: dim.error }, { status: 400 });
    }

    const extMatch = /\.(webp|jpe?g|png|gif)$/i.exec(file.name || "");
    const ext = extMatch?.[1] || "jpg";
    const fileId = randomUUID();
    const r2Key = buildMenuItemImageKey(String(storeId).trim(), String(itemRow.item_id), fileId, ext);

    let uploadedKey: string | null = r2Key;
    try {
      await uploadToR2(file, r2Key);
      const imageUrl = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
      const staffActor = isStaff || access.isPlatformStaff === true;
      const created = await addItemImageRow(menuItemId, access.storeIdNum, {
        image_url: imageUrl,
        r2_key: r2Key,
        is_primary: true,
        format: ext,
        autoApprove: staffActor,
        moderated_by: staffActor ? (user.email ?? user.id) : null,
      });

      // Merchants only: force item back into review. Staff changes apply live.
      if (!staffActor) {
        await setItemPendingForReReview(menuItemId, access.storeIdNum, {
          changed_by: user.id,
          changed_by_role: "merchant",
        });
      }

      try {
        await logStoreActivity({
          storeId: access.storeIdNum,
          section: "menu_item",
          action: "create",
          entityId: menuItemId,
          summary: staffActor
            ? `Staff uploaded image for item #${menuItemId} (auto-approved)`
            : `Partner uploaded image for item #${menuItemId}`,
          actorType: staffActor ? "system" : "merchant",
        });
      } catch {
        /* non-fatal */
      }

      return NextResponse.json(
        { id: created.id, image_url: imageUrl, r2_key: r2Key },
        { status: 201 },
      );
    } catch (e) {
      if (uploadedKey) {
        try {
          await deleteFromR2(uploadedKey);
        } catch {
          /* cleanup */
        }
      }
      if (e instanceof Error && e.message === "ITEM_NOT_FOUND") {
        return NextResponse.json({ error: "item_not_found" }, { status: 404 });
      }
      console.error("[menu-items/images POST]", e);
      return NextResponse.json(
        { error: "upload_failed", message: e instanceof Error ? e.message : "Upload failed" },
        { status: 500 },
      );
    }
  } catch (e) {
    console.error("[menu-items/images POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}

/**
 * Categories CRUD for dashboard store menu.
 * POST /api/merchant/stores/[id]/menu/categories
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import {
  validateCategoryCreate,
  resolveStoreTypeForMenu,
  CategoryRuleError,
} from "@/lib/db/operations/menu-category-rules";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }

    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      category_name?: string;
      category_description?: string | null;
      category_image_url?: string | null;
      parent_category_id?: number | null;
      cuisine_id?: number | null;
      display_order?: number;
      is_active?: boolean;
    };
    const name = (body.category_name ?? "").trim();
    if (!name) return NextResponse.json({ success: false, error: "category_name required" }, { status: 400 });

    const storeType = await resolveStoreTypeForMenu(storeId);
    const { cuisine_id } = await validateCategoryCreate({
      storeIdNum: storeId,
      storeType,
      parent_category_id: body.parent_category_id,
      cuisine_id: body.cuisine_id,
      category_name: name,
    });

    const sql = getSql();
    try {
      const [row] = await sql`
        INSERT INTO merchant_menu_categories (
          store_id, category_name, category_description, category_image_url,
          parent_category_id, cuisine_id, display_order, is_active, is_deleted, created_at, updated_at
        )
        VALUES (
          ${storeId},
          ${name},
          ${body.category_description ?? null},
          ${body.category_image_url ?? null},
          ${body.parent_category_id ?? null},
          ${cuisine_id},
          ${body.display_order ?? 0},
          ${body.is_active ?? true},
          FALSE,
          NOW(),
          NOW()
        )
        RETURNING id
      `;
      try {
        await logStoreActivity({
          storeId,
          section: "category",
          action: "create",
          entityName: name,
          summary: `Agent created category "${name}"`,
          actorType: "agent",
          source: "dashboard",
        });
      } catch (_) {}
      return NextResponse.json({ success: true, id: Number((row as any).id) }, { status: 201 });
    } catch (ins: unknown) {
      const msg = String((ins as Error)?.message || ins);
      if (msg.includes("duplicate") || (ins as { code?: string })?.code === "23505") {
        return NextResponse.json(
          { success: false, error: "duplicate_category_name", message: "A category with this name already exists" },
          { status: 409 }
        );
      }
      throw ins;
    }
  } catch (e) {
    if (e instanceof CategoryRuleError) {
      return NextResponse.json(
        { success: false, error: e.code, message: e.message },
        { status: e.httpStatus }
      );
    }
    console.error("[POST /api/merchant/stores/[id]/menu/categories]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

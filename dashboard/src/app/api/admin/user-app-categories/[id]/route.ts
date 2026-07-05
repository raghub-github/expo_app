/**
 * PATCH /api/admin/user-app-categories/[id] — super admin
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/require-super-admin-api";
import { updateUserAppCategory, deleteUserAppCategory } from "@/lib/db/operations/user-app-categories";
import {
  parseUserAppCategoryStoreType,
  parseUserAppCategoryStatus,
  parseUserAppCategoryDisplayOrder,
} from "@/lib/user-app-categories/shared";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const patch: Parameters<typeof updateUserAppCategory>[1] = {};

    if ("store_type" in body && body.store_type != null && body.store_type !== "") {
      const st = parseUserAppCategoryStoreType(body.store_type);
      if (st == null) {
        return NextResponse.json({ success: false, error: "Invalid store_type" }, { status: 400 });
      }
      patch.store_type = st;
    }
    if (typeof body.name === "string") patch.name = body.name;
    if (body.image_url === null || typeof body.image_url === "string") patch.image_url = body.image_url;
    if ("status" in body) {
      const st = parseUserAppCategoryStatus(body.status);
      if (body.status != null && body.status !== "" && st == null) {
        return NextResponse.json({ success: false, error: "status must be active or inactive" }, { status: 400 });
      }
      if (st != null) patch.status = st;
    }
    if ("display_order" in body) {
      const ord = parseUserAppCategoryDisplayOrder(body.display_order);
      if (ord === null) {
        return NextResponse.json(
          { success: false, error: "display_order must be an integer" },
          { status: 400 }
        );
      }
      patch.display_order = ord;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    const result = await updateUserAppCategory(id, patch);
    if (!result.ok) {
      if (result.error === "not_found") {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }
    return NextResponse.json({ success: true, item: result.row });
  } catch (e) {
    console.error("[PATCH /api/admin/user-app-categories/[id]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const result = await deleteUserAppCategory(id);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/admin/user-app-categories/[id]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

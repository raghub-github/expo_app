import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import {
  updateOrderRemarkWithHistory,
  listOrderRemarkEdits,
} from "@/lib/db/operations/order-remarks";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string; remarkId: string }> }
) {
  try {
    const { orderId: orderIdParam, remarkId: remarkIdParam } = await context.params;

    const orderId = Number(orderIdParam);
    if (!Number.isFinite(orderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid order id" },
        { status: 400 }
      );
    }

    const remarkIdNum = Number(remarkIdParam);
    if (!Number.isFinite(remarkIdNum)) {
      return NextResponse.json(
        { success: false, error: "Invalid remark id" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Access to Orders dashboard required.",
        },
        { status: 403 }
      );
    }

    const history = await listOrderRemarkEdits(remarkIdNum);

    return NextResponse.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/remarks/[remarkId]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderId: string; remarkId: string }> }
) {
  try {
    const { orderId: orderIdParam, remarkId: remarkIdParam } = await context.params;

    const orderId = Number(orderIdParam);
    if (!Number.isFinite(orderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid order id" },
        { status: 400 }
      );
    }

    const remarkIdNum = Number(remarkIdParam);
    if (!Number.isFinite(remarkIdNum)) {
      return NextResponse.json(
        { success: false, error: "Invalid remark id" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Access to Orders dashboard required.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const rawRemark: string = (body.remark ?? "").toString();
    const remark = rawRemark.trim();
    if (!remark) {
      return NextResponse.json(
        { success: false, error: "Remark text is required" },
        { status: 400 }
      );
    }

    const systemUser = await getSystemUserByEmail(user.email);
    const actorId = systemUser?.id ?? null;
    const actorName = systemUser?.full_name ?? user.email ?? null;
    const actorType = systemUser?.primary_role ?? "AGENT";

    const updated = await updateOrderRemarkWithHistory({
      remarkId: remarkIdNum,
      editorActorType: actorType,
      editorActorId: actorId,
      editorActorName: actorName,
      remark,
      remarkCategory: body.remarkCategory ?? null,
      remarkPriority: body.remarkPriority ?? null,
      isInternal: typeof body.isInternal === "boolean" ? body.isInternal : undefined,
      visibleTo: Array.isArray(body.visibleTo) ? body.visibleTo : undefined,
      remarkMetadata: body.remarkMetadata ?? undefined,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("[PATCH /api/orders/[orderId]/remarks/[remarkId]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


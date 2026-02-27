import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import {
  createOrderRiderRecon,
  listOrderRiderRecons,
} from "@/lib/db/operations/order-recons";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) ? id : null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Invalid order id" },
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

    const recons = await listOrderRiderRecons(orderId);

    return NextResponse.json({
      success: true,
      data: recons,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[GET /api/orders/[orderId]/recons] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Invalid order id" },
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

    const reasonPreset: string | null =
      typeof body.reasonPreset === "string" && body.reasonPreset.trim()
        ? body.reasonPreset.trim()
        : null;
    const reasonText: string | null =
      typeof body.reasonText === "string" && body.reasonText.trim()
        ? body.reasonText.trim()
        : null;

    const merchantStoreId: number | null =
      typeof body.merchantStoreId === "number" && Number.isFinite(body.merchantStoreId)
        ? body.merchantStoreId
        : null;
    const providerName: string | null =
      typeof body.providerName === "string" && body.providerName.trim()
        ? body.providerName.trim()
        : null;
    const trackingId: string | null =
      typeof body.trackingId === "string" && body.trackingId.trim()
        ? body.trackingId.trim()
        : null;
    const riderId: number | null =
      typeof body.riderId === "number" && Number.isFinite(body.riderId)
        ? body.riderId
        : null;
    const riderName: string | null =
      typeof body.riderName === "string" && body.riderName.trim()
        ? body.riderName.trim()
        : null;
    const riderMobile: string | null =
      typeof body.riderMobile === "string" && body.riderMobile.trim()
        ? body.riderMobile.trim()
        : null;

    if (!reasonPreset && !reasonText) {
      return NextResponse.json(
        { success: false, error: "Recon reason is required" },
        { status: 400 }
      );
    }

    const systemUser = await getSystemUserByEmail(user.email);
    const actorSystemUserId = systemUser?.id ?? null;

    try {
      const created = await createOrderRiderRecon({
        orderId,
        merchantStoreId,
        providerName,
        trackingId,
        riderId,
        riderName,
        riderMobile,
        actorSystemUserId,
        actorEmail: user.email ?? null,
        reasonPreset,
        reasonText,
      });

      return NextResponse.json({
        success: true,
        data: created,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "RECON_ALREADY_EXISTS") {
          return NextResponse.json(
            {
              success: false,
              error: "Recon already exists for this rider on this order",
              code: "RECON_ALREADY_EXISTS",
            },
            { status: 409 }
          );
        }
        if (error.message === "RECON_REASON_REQUIRED") {
          return NextResponse.json(
            {
              success: false,
              error: "Recon reason is required",
              code: "RECON_REASON_REQUIRED",
            },
            { status: 400 }
          );
        }
      }

      throw error;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[POST /api/orders/[orderId]/recons] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


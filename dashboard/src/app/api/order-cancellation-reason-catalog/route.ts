import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getCancellationCatalogPayload } from "@/lib/db/operations/order-cancellation-reason-catalog";

export const runtime = "nodejs";

export async function GET() {
  try {
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

    const canView =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));
    if (!canView) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const { attributes, grouped } = await getCancellationCatalogPayload({
      activeOnly: true,
      channel: "web",
    });
    return NextResponse.json({ success: true, attributes, grouped });
  } catch (error) {
    console.error("[GET /api/order-cancellation-reason-catalog]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load catalog",
      },
      { status: 500 }
    );
  }
}

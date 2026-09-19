import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getCancellationCatalogPayload } from "@/lib/db/operations/order-cancellation-reason-catalog";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);

    let email = (auth.user.email ?? "").trim();
    if (!email) {
      const mapped = await resolveSystemUserForSupabaseAuth(auth.user.id, undefined);
      email = (mapped?.email ?? "").trim();
    }
    if (!email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const canView =
      (await isSuperAdmin(auth.user.id, email)) ||
      (await hasDashboardAccessByAuth(auth.user.id, email, "ORDER_FOOD"));
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

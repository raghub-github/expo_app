/**
 * GET /api/riders/pending-onboarding
 * List riders whose onboarding is not yet ACTIVE (ops call queue).
 */

import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { listRidersPendingOnboarding } from "@/lib/db/operations/riders";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

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

    const userIsSuperAdmin = await isSuperAdmin(auth.user.id, email);
    const hasRiderAccess = await hasDashboardAccessByAuth(auth.user.id, email, "RIDER");

    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. RIDER dashboard access required.",
        },
        { status: 403 }
      );
    }

    const sp = request.nextUrl.searchParams;
    const limitRaw = Number(sp.get("limit") || "50");
    const offsetRaw = Number(sp.get("offset") || "0");
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
    const stage = sp.get("stage");
    const search = sp.get("search") || sp.get("q");

    const { riders, total } = await listRidersPendingOnboarding({
      limit,
      offset,
      stage,
      search,
    });

    return NextResponse.json({
      success: true,
      data: riders,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[riders/pending-onboarding]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load pending onboarding riders" },
      { status: 500 }
    );
  }
}

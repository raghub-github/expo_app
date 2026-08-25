/**
 * GET /api/customers/users-by-state
 * States/UT list with customer join counts for the platform.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { getUserPermissions, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getCustomerUsersByState } from "@/lib/db/operations/customer-users-by-state";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }
    const { user } = auth;

    const perms = await getUserPermissions(user.id, user.email ?? "");
    if (!perms) {
      return NextResponse.json(
        {
          success: false,
          error: "Service temporarily unavailable",
          code: "SERVICE_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    const hasDashboardAccess = await hasDashboardAccessByAuth(
      user.id,
      user.email ?? "",
      "CUSTOMER"
    );

    if (!perms.isSuperAdmin && !hasDashboardAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const data = await getCustomerUsersByState();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/customers/users-by-state]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load users by state",
      },
      { status: 500 }
    );
  }
}

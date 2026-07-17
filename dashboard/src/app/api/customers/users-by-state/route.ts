/**
 * GET /api/customers/users-by-state
 * States/UT list with customer join counts for the platform.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getCustomerUsersByState } from "@/lib/db/operations/customer-users-by-state";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasDashboardAccess = await hasDashboardAccessByAuth(
      user.id,
      user.email ?? "",
      "CUSTOMER"
    );

    if (!userIsSuperAdmin && !hasDashboardAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions." },
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

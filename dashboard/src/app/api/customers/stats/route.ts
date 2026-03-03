/**
 * Customer Dashboard Statistics API Route
 * GET /api/customers/stats - Get aggregated dashboard statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCustomerDashboardStats } from "@/lib/db/operations/customer-stats";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { logAPICall } from "@/lib/auth/activity-tracker";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = 'nodejs';

/**
 * GET /api/customers/stats
 * Get customer dashboard statistics
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user is super admin or has CUSTOMER dashboard access
    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasDashboardAccess = await hasDashboardAccessByAuth(
      user.id,
      user.email ?? "",
      "CUSTOMER"
    );

    if (!userIsSuperAdmin && !hasDashboardAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. You need access to the Customer dashboard." },
        { status: 403 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const filters = {
      orderType: searchParams.get("orderType") as "food" | "parcel" | "person_ride" | undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      city: searchParams.get("city") || undefined,
      accountStatus: searchParams.get("accountStatus") || undefined,
      riskFlag: searchParams.get("riskFlag") || undefined,
    };

    // Get system user ID
    const systemUser = await getSystemUserByEmail(user.email ?? "");
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Fetch dashboard statistics
    const stats = await getCustomerDashboardStats(filters);

    // Log activity
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAPICall(
      systemUser.id,
      "/api/customers/stats",
      "GET",
      true,
      filters,
      { statsRetrieved: true },
      ipAddress
    );

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("[GET /api/customers/stats] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Customer Management API Routes
 * GET /api/customers - List customers with filters and pagination
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCustomers, getCustomerByCustomerId } from "@/lib/db/operations/customers";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { logAPICall } from "@/lib/auth/activity-tracker";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = 'nodejs';

/**
 * GET /api/customers
 * List customers with filters and pagination
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
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "20"),
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      orderType: searchParams.get("orderType") as "food" | "parcel" | "person_ride" | undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      sortBy: searchParams.get("sortBy") || undefined,
      sortOrder: (searchParams.get("sortOrder") || "desc") as "asc" | "desc",
    };

    // Get system user ID
    const systemUser = await getSystemUserByEmail(user.email ?? "");
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Fetch customers
    const result = await listCustomers(filters);

    // Log activity
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAPICall(
      systemUser.id,
      "/api/customers",
      "GET",
      true,
      filters,
      { count: result.customers.length },
      ipAddress
    );

    return NextResponse.json({
      success: true,
      data: result.customers,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[GET /api/customers] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

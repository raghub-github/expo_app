/**
 * Customer Detail API Routes
 * GET /api/customers/[id] - Get customer by ID
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCustomerById, getCustomerByCustomerId } from "@/lib/db/operations/customers";
import { checkPermission } from "@/lib/permissions/engine";
import { logAPICall } from "@/lib/auth/activity-tracker";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = 'nodejs';

/**
 * GET /api/customers/[id]
 * Get customer details by ID or customer_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check permission
    const hasPermission = await checkPermission(
      user.id,
      user.email ?? "",
      "CUSTOMERS",
      "VIEW"
    );

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Get system user ID
    const systemUser = await getSystemUserByEmail(user.email ?? "");
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    const { id } = await params;
    
    // Try to parse as number (database ID), otherwise treat as customer_id
    const numericId = parseInt(id);
    let customer;
    
    if (!isNaN(numericId) && numericId.toString() === id) {
      customer = await getCustomerById(numericId);
    } else {
      customer = await getCustomerByCustomerId(id);
    }

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    // Log activity
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAPICall(
      systemUser.id,
      `/api/customers/${id}`,
      "GET",
      true,
      { id },
      { customerId: customer.customerId },
      ipAddress
    );

    return NextResponse.json({
      success: true,
      data: customer,
    });
  } catch (error) {
    console.error("[GET /api/customers/[id]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

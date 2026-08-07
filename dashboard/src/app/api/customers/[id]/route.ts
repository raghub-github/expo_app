/**
 * GET /api/customers/[id] - Get customer by ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import {
  getCustomerById,
  getCustomerByCustomerId,
  getCustomerOrderStats,
  getCustomerActivityDaily,
} from "@/lib/db/operations/customers";
import { checkPermission } from "@/lib/permissions/engine";
import { logAPICall } from "@/lib/auth/activity-tracker";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = "nodejs";

/**
 * GET /api/customers/[id]
 * Get customer details by ID or customer_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }
    const { user } = auth;

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

    const systemUser = await getSystemUserByEmail(user.email ?? "");
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    const { id } = await params;

    const numericId = parseInt(id, 10);
    let customer;

    if (!Number.isNaN(numericId) && numericId.toString() === id) {
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

    const ipAddress =
      request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAPICall(
      systemUser.id,
      `/api/customers/${id}`,
      "GET",
      true,
      { id },
      { customerId: customer.customerId },
      ipAddress
    );

    const [orderStats, activityDaily] = await Promise.all([
      getCustomerOrderStats(customer.id),
      getCustomerActivityDaily(customer.id, 90),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...customer,
        profileImageUrl: customer.profileImageUrl
          ? resolveAttachmentProxyUrl(customer.profileImageUrl) || customer.profileImageUrl
          : customer.profileImageUrl,
        orderStats,
        activityDaily,
      },
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

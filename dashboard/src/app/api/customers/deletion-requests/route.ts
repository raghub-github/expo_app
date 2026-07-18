/**
 * GET  /api/customers/deletion-requests — list pending (or status=) deletion requests
 * POST /api/customers/deletion-requests — complete deletion for a request id
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { logAPICall } from "@/lib/auth/activity-tracker";
import {
  completeAccountDeletionRequest,
  listAccountDeletionRequests,
} from "@/lib/db/operations/account-deletion-requests";

export const runtime = "nodejs";

async function requireCustomerAdmin(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }

  const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
  const hasDashboardAccess = await hasDashboardAccessByAuth(
    user.id,
    user.email ?? "",
    "CUSTOMER"
  );

  if (!userIsSuperAdmin && !hasDashboardAccess) {
    return {
      error: NextResponse.json(
        { success: false, error: "Insufficient permissions for Customer dashboard." },
        { status: 403 }
      ),
    };
  }

  const systemUser = await getSystemUserByEmail(user.email ?? "");
  if (!systemUser) {
    return {
      error: NextResponse.json({ success: false, error: "User not found in system" }, { status: 404 }),
    };
  }

  return { user, systemUser, request };
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireCustomerAdmin(request);
    if ("error" in gate && gate.error) return gate.error;

    const status = request.nextUrl.searchParams.get("status") || "pending_review";
    const rows = await listAccountDeletionRequests({ status });

    const ipAddress =
      request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAPICall(
      gate.systemUser!.id,
      "/api/customers/deletion-requests",
      "GET",
      true,
      { status },
      { count: rows.length },
      ipAddress
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    console.error("[GET /api/customers/deletion-requests]", e);
    return NextResponse.json({ success: false, error: "Failed to load deletion requests" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireCustomerAdmin(request);
    if ("error" in gate && gate.error) return gate.error;

    const body = (await request.json().catch(() => ({}))) as {
      requestId?: number;
      reviewNotes?: string;
    };
    const requestId = Number(body.requestId);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return NextResponse.json({ success: false, error: "requestId is required" }, { status: 400 });
    }

    const result = await completeAccountDeletionRequest({
      requestId,
      reviewedBy: gate.user!.email ?? gate.systemUser!.email ?? String(gate.systemUser!.id),
      reviewNotes: body.reviewNotes ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAPICall(
      gate.systemUser!.id,
      "/api/customers/deletion-requests",
      "POST",
      true,
      { requestId },
      { customerId: result.customerId },
      ipAddress
    );

    return NextResponse.json({
      success: true,
      data: {
        customerId: result.customerId,
        message: "Account deleted. The customer app session will be signed out on next request.",
      },
    });
  } catch (e) {
    console.error("[POST /api/customers/deletion-requests]", e);
    return NextResponse.json({ success: false, error: "Failed to complete deletion" }, { status: 500 });
  }
}

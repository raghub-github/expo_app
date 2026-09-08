/**
 * POST /api/riders/[id]/documents/ensure
 * Create a stub rider_documents row (same table as app onboarding) so dashboard
 * electronic verify / approve can run when the rider never uploaded the file.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRiderById } from "@/lib/db/operations/riders";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import {
  ensureRiderDocumentRow,
  isAllowedAdminDisplayDocType,
  serializeRiderDocumentForDashboard,
} from "@/lib/rider-document-admin";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const email = user.email ?? "";
    const userIsSuperAdmin = await isSuperAdmin(user.id, email);
    const canApprove = await canPerformActionByAuth(
      user.id,
      email,
      "RIDER",
      "APPROVE",
      "RIDER_DOCUMENT",
    );
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, email, "RIDER");
    if (!userIsSuperAdmin && !canApprove && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (Number.isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const rider = await getRiderById(riderId);
    if (!rider) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { displayDocType?: string };
    const displayDocType = String(body.displayDocType || "").trim();
    if (!isAllowedAdminDisplayDocType(displayDocType)) {
      return NextResponse.json({ success: false, error: "Invalid document type" }, { status: 400 });
    }

    const { row, created } = await ensureRiderDocumentRow({ riderId, displayDocType });
    return NextResponse.json({
      success: true,
      data: { ...serializeRiderDocumentForDashboard(row, displayDocType), created },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/documents/ensure]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

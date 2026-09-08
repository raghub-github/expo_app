/**
 * POST /api/riders/[id]/documents
 * Create (if needed) + upload a rider document using the same rider_documents
 * row / R2 keys as the rider app onboarding flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRiderById } from "@/lib/db/operations/riders";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { logActionFromRequest } from "@/lib/utils/action-audit";
import {
  createOrUpdateRiderDocumentFromAdmin,
  isAllowedAdminDisplayDocType,
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

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const canUpdate = await canPerformActionByAuth(
      user.id,
      user.email ?? "",
      "RIDER",
      "UPDATE",
      "RIDER_DOCUMENT",
    );
    if (!userIsSuperAdmin && !canUpdate) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. UPDATE action on RIDER_DOCUMENT required." },
        { status: 403 },
      );
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

    const formData = await request.formData();
    const displayDocType = String(formData.get("displayDocType") || "").trim();
    const docNumberRaw = formData.get("docNumber");
    const docNumber =
      typeof docNumberRaw === "string" ? docNumberRaw : undefined;
    const rawFile = formData.get("file");
    const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;

    if (!isAllowedAdminDisplayDocType(displayDocType)) {
      return NextResponse.json({ success: false, error: "Invalid document type" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ success: false, error: "A document image or PDF is required" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (file.type && !allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Invalid file type. Allowed types: JPEG, PNG, WebP, PDF" },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "File size exceeds 10MB limit" }, { status: 400 });
    }

    const data = await createOrUpdateRiderDocumentFromAdmin({
      riderId,
      displayDocType,
      file,
      docNumber,
    });

    await logActionFromRequest(user.email ?? "", "RIDER", "RIDER_DOCUMENT_IMAGE_UPDATED", {
      resourceType: "RIDER_DOCUMENT",
      resourceId: String(data.id),
      newValues: { displayDocType, docNumber: data.docNumber },
      actionDetails: { riderId, createdFromDashboard: true },
      ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
      requestPath: request.nextUrl.pathname,
      requestMethod: "POST",
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[POST /api/riders/[id]/documents] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * R2 Document Upload API
 * POST /api/riders/[id]/documents/upload
 * Uploads a document file to R2 and returns the key and signed URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadDocument } from "@/lib/services/r2";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { getRiderById } from "@/lib/db/operations/riders";

export const runtime = 'nodejs';

/**
 * POST /api/riders/[id]/documents/upload
 * Upload document to R2
 */
export async function POST(
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

    // Check if user is super admin or can perform UPDATE action on RIDER dashboard
    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const canUpdate = await canPerformActionByAuth(
      user.id,
      user.email ?? "",
      "RIDER",
      "UPDATE",
      "RIDER_DOCUMENT"
    );

    if (!userIsSuperAdmin && !canUpdate) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. UPDATE action on RIDER_DOCUMENT required." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID" },
        { status: 400 }
      );
    }

    // Verify rider exists
    const rider = await getRiderById(riderId);
    if (!rider) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("docType") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (!docType) {
      return NextResponse.json(
        { success: false, error: "Document type is required" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Invalid file type. Allowed types: JPEG, PNG, WebP, PDF" },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Validate document type
    const validDocTypes = ["aadhaar", "pan", "dl", "rc", "selfie", "rental_proof", "ev_proof"];
    if (!validDocTypes.includes(docType)) {
      return NextResponse.json(
        { success: false, error: "Invalid document type" },
        { status: 400 }
      );
    }

    // Upload to R2
    const uploadResult = await uploadDocument(file, riderId, docType);

    return NextResponse.json({
      success: true,
      data: uploadResult,
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/documents/upload] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

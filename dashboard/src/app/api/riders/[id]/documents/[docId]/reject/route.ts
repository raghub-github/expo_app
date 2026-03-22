/**
 * Rider Document Rejection API
 * POST /api/riders/[id]/documents/[docId]/reject - Reject a rider document
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getRiderDocumentById,
  rejectRiderDocument,
  getRiderById,
  updateRiderKycStatus,
} from "@/lib/db/operations/riders";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { logActionFromRequest } from "@/lib/utils/action-audit";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = 'nodejs';

/**
 * POST /api/riders/[id]/documents/[docId]/reject
 * Reject a rider document
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
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

    // Check if user is super admin or can perform REJECT action on RIDER dashboard
    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const canReject = await canPerformActionByAuth(
      user.id,
      user.email ?? "",
      "RIDER",
      "REJECT",
      "RIDER_DOCUMENT"
    );

    if (!userIsSuperAdmin && !canReject) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. REJECT action on RIDER_DOCUMENT required." },
        { status: 403 }
      );
    }

    const { id, docId } = await params;
    const riderId = parseInt(id);
    const documentId = parseInt(docId);

    if (isNaN(riderId) || isNaN(documentId)) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID or document ID" },
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

    // Get current document
    const currentDoc = await getRiderDocumentById(documentId);
    if (!currentDoc) {
      return NextResponse.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      );
    }

    // Verify document belongs to rider
    if (currentDoc.riderId !== riderId) {
      return NextResponse.json(
        { success: false, error: "Document does not belong to this rider" },
        { status: 403 }
      );
    }

    // Only allow rejecting MANUAL_UPLOAD documents
    // APP_VERIFIED documents cannot be rejected by agents
    if (currentDoc.verificationMethod === "APP_VERIFIED") {
      return NextResponse.json(
        { success: false, error: "APP_VERIFIED documents cannot be rejected by agents." },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { reason } = body;

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Rejection reason is required" },
        { status: 400 }
      );
    }

    // Get agent information
    const agent = await getSystemUserByEmail(user.email ?? "");
    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    // Reject document
    const rejectedDoc = await rejectRiderDocument(documentId, agent.id, reason.trim());

    if (!rejectedDoc) {
      return NextResponse.json(
        { success: false, error: "Failed to reject document" },
        { status: 500 }
      );
    }

    // If this is a critical document (aadhaar, pan, dl, rc), update KYC status to REJECTED
    const criticalDocs = ["aadhaar", "pan", "dl", "rc"];
    const isCriticalDoc = criticalDocs.includes(currentDoc.docType);
    
    if (isCriticalDoc) {
      await updateRiderKycStatus(riderId, "REJECTED");
    }

    // Log action
    await logActionFromRequest(
      user.email ?? "",
      "RIDER",
      "RIDER_DOCUMENT_REJECTED",
      {
        resourceType: "RIDER_DOCUMENT",
        resourceId: documentId.toString(),
        previousValues: {
          verified: currentDoc.verified,
          rejectedReason: currentDoc.rejectedReason,
        },
        newValues: {
          verified: rejectedDoc.verified,
          rejectedReason: rejectedDoc.rejectedReason,
        },
        actionDetails: {
          riderId,
          docType: currentDoc.docType,
          reason: reason.trim(),
          isCriticalDocument: isCriticalDoc,
          kycStatusUpdated: isCriticalDoc,
        },
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        requestPath: request.nextUrl.pathname,
        requestMethod: "POST",
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        document: rejectedDoc,
        kycStatus: isCriticalDoc ? "REJECTED" : rider.kycStatus,
      },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/documents/[docId]/reject] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Rider Document Approval API
 * POST /api/riders/[id]/documents/[docId]/approve - Approve a rider document
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getRiderDocumentById,
  approveRiderDocument,
  getRiderById,
} from "@/lib/db/operations/riders";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { logActionFromRequest } from "@/lib/utils/action-audit";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = 'nodejs';

/**
 * POST /api/riders/[id]/documents/[docId]/approve
 * Approve a rider document
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

    // Check if user is super admin or can perform APPROVE action on RIDER dashboard
    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const canApprove = await canPerformActionByAuth(
      user.id,
      user.email ?? "",
      "RIDER",
      "APPROVE",
      "RIDER_DOCUMENT"
    );

    if (!userIsSuperAdmin && !canApprove) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. APPROVE action on RIDER_DOCUMENT required." },
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

    // Only allow approving MANUAL_UPLOAD documents
    // APP_VERIFIED documents are already verified and don't need agent approval
    if (currentDoc.verificationMethod === "APP_VERIFIED") {
      return NextResponse.json(
        { success: false, error: "APP_VERIFIED documents cannot be approved by agents. They are already verified." },
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

    // Approve document (handles KYC, onboarding stage, and rider status in one place)
    const result = await approveRiderDocument(documentId, agent.id);

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Failed to approve document" },
        { status: 500 }
      );
    }

    const { approved: approvedDoc, riderState } = result;

    // Re-fetch rider so response has current kycStatus, onboardingStage, status for optimistic UI
    const updatedRider = await getRiderById(riderId);
    const allVerified = currentDoc.verificationMethod === "MANUAL_UPLOAD" && updatedRider
      ? updatedRider.kycStatus === "APPROVED"
      : false;

    // Log action
    await logActionFromRequest(
      user.email ?? "",
      "RIDER",
      "RIDER_DOCUMENT_APPROVED",
      {
        resourceType: "RIDER_DOCUMENT",
        resourceId: documentId.toString(),
        previousValues: {
          verified: currentDoc.verified,
          verifierUserId: currentDoc.verifierUserId,
        },
        newValues: {
          verified: approvedDoc.verified,
          verifierUserId: approvedDoc.verifierUserId,
        },
        actionDetails: {
          riderId,
          docType: currentDoc.docType,
          allDocumentsVerified: allVerified,
          kycStatusUpdated: allVerified,
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
        document: approvedDoc,
        allDocumentsVerified: allVerified,
        kycStatus: riderState.kycStatus,
        onboardingStage: riderState.onboardingStage,
        status: riderState.status,
        verificationMethod: currentDoc.verificationMethod,
      },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/documents/[docId]/approve] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

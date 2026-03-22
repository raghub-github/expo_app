/**
 * Rider Document Update API
 * PUT /api/riders/[id]/documents/[docId] - Update document number and/or image
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getRiderDocumentById,
  updateRiderDocument,
  getRiderById,
} from "@/lib/db/operations/riders";
import { uploadDocument } from "@/lib/services/r2";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { logActionFromRequest } from "@/lib/utils/action-audit";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = 'nodejs';

/**
 * PUT /api/riders/[id]/documents/[docId]
 * Update document number and/or image
 */
export async function PUT(
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

    // Only allow editing MANUAL_UPLOAD documents
    // APP_VERIFIED documents cannot be edited (they don't have images)
    if (currentDoc.verificationMethod === "APP_VERIFIED") {
      return NextResponse.json(
        { success: false, error: "APP_VERIFIED documents cannot be edited. They are verified through the app and don't have images." },
        { status: 400 }
      );
    }

    // Parse request body (can be JSON or FormData)
    const contentType = request.headers.get("content-type") || "";
    let docNumber: string | undefined;
    let file: File | null = null;

    let docNumberSent = false;
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      docNumberSent = formData.has("docNumber");
      docNumber = docNumberSent ? (formData.get("docNumber") as string | null) ?? undefined : undefined;
      file = formData.get("file") as File | null;
    } else {
      const body = await request.json();
      docNumber = body.docNumber;
      docNumberSent = docNumber !== undefined;
      // For JSON, file would need to be base64 encoded or handled separately
    }

    // Prepare update object
    const updates: {
      docNumber?: string;
      fileUrl?: string;
      r2Key?: string;
    } = {};

    const previousValues: Record<string, any> = {
      docNumber: currentDoc.docNumber,
      fileUrl: currentDoc.fileUrl,
      r2Key: currentDoc.r2Key,
    };

    // Update document number only when client sent it (avoid overwriting with null on image-only update)
    if (docNumberSent) {
      updates.docNumber = docNumber != null && String(docNumber).trim() ? String(docNumber).trim() : undefined;
    }

    // Handle file upload if provided
    if (file) {
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

      // Upload new file to R2, replacing old file if exists
      try {
        const uploadResult = await uploadDocument(
          file,
          riderId,
          currentDoc.docType,
          currentDoc.r2Key || null // Pass old key to delete it
        );
        
        // Verify upload was successful before updating DB
        if (!uploadResult.key || !uploadResult.signedUrl) {
          throw new Error("R2 upload returned invalid result");
        }
        
        updates.fileUrl = uploadResult.signedUrl;
        updates.r2Key = uploadResult.key;
        
        console.log(`[Document Update] Successfully uploaded new file for rider ${riderId}, doc ${documentId}, type ${currentDoc.docType}`);
        if (currentDoc.r2Key) {
          console.log(`[Document Update] Old file marked for deletion: ${currentDoc.r2Key}`);
        }
      } catch (uploadError) {
        console.error(`[Document Update] R2 upload failed for rider ${riderId}, doc ${documentId}:`, uploadError);
        throw new Error(`Failed to upload document: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
      }
    }

    // Update document if there are changes
    if (Object.keys(updates).length > 0) {
      // Ensure doc_number is saved if provided (especially for RC and DL)
      if (docNumber !== undefined && (currentDoc.docType === 'rc' || currentDoc.docType === 'dl')) {
        if (!docNumber || docNumber.trim() === '') {
          console.warn(`[Document Update] Warning: ${currentDoc.docType.toUpperCase()} document should have a document number`);
        }
      }
      
      const updatedDoc = await updateRiderDocument(documentId, updates);
      
      if (!updatedDoc) {
        throw new Error("Failed to update document in database");
      }
      
      console.log(`[Document Update] Successfully updated document ${documentId} in database`);

      // Log action
      const agent = await getSystemUserByEmail(user.email ?? "");
      if (agent) {
        await logActionFromRequest(
          user.email ?? "",
          "RIDER",
          docNumber !== undefined && file
            ? "RIDER_DOCUMENT_UPDATED"
            : docNumber !== undefined
            ? "RIDER_DOCUMENT_NUMBER_UPDATED"
            : "RIDER_DOCUMENT_IMAGE_UPDATED",
          {
            resourceType: "RIDER_DOCUMENT",
            resourceId: documentId.toString(),
            previousValues,
            newValues: {
              docNumber: updatedDoc?.docNumber,
              fileUrl: updatedDoc?.fileUrl,
              r2Key: updatedDoc?.r2Key,
            },
            actionDetails: {
              riderId,
              docType: currentDoc.docType,
              changes: Object.keys(updates),
            },
            ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
            userAgent: request.headers.get("user-agent") || undefined,
            requestPath: request.nextUrl.pathname,
            requestMethod: "PUT",
          }
        );
      }

      return NextResponse.json({
        success: true,
        data: updatedDoc,
      });
    }

    // No changes
    return NextResponse.json({
      success: true,
      data: currentDoc,
      message: "No changes provided",
    });
  } catch (error) {
    console.error("[PUT /api/riders/[id]/documents/[docId]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

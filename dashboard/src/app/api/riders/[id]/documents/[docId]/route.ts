/**
 * Rider Document Update API
 * PUT /api/riders/[id]/documents/[docId] - Update document number, replace image, or remove image
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRiderDocumentById, getRiderById, updateRiderDocument } from "@/lib/db/operations/riders";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { logActionFromRequest } from "@/lib/utils/action-audit";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import {
  removeRiderDocumentImage,
  uploadRiderDocumentImage,
} from "@/lib/rider-document-admin";

export const runtime = "nodejs";

async function authorizeRiderDocumentUpdate(riderId: number, documentId: number) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }

  const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
  const canUpdate = await canPerformActionByAuth(
    user.id,
    user.email ?? "",
    "RIDER",
    "UPDATE",
    "RIDER_DOCUMENT"
  );

  if (!userIsSuperAdmin && !canUpdate) {
    return {
      error: NextResponse.json(
        { success: false, error: "Insufficient permissions. UPDATE action on RIDER_DOCUMENT required." },
        { status: 403 }
      ),
    };
  }

  const rider = await getRiderById(riderId);
  if (!rider) {
    return { error: NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 }) };
  }

  const currentDoc = await getRiderDocumentById(documentId);
  if (!currentDoc) {
    return { error: NextResponse.json({ success: false, error: "Document not found" }, { status: 404 }) };
  }

  if (currentDoc.riderId !== riderId) {
    return {
      error: NextResponse.json(
        { success: false, error: "Document does not belong to this rider" },
        { status: 403 }
      ),
    };
  }

  if (currentDoc.verificationMethod === "APP_VERIFIED") {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: "APP_VERIFIED documents cannot be edited. They are verified through the app and don't have images.",
        },
        { status: 400 }
      ),
    };
  }

  return { user, currentDoc };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    const riderId = parseInt(id);
    const documentId = parseInt(docId);

    if (isNaN(riderId) || isNaN(documentId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID or document ID" }, { status: 400 });
    }

    const auth = await authorizeRiderDocumentUpdate(riderId, documentId);
    if ("error" in auth && auth.error) return auth.error;
    const { user, currentDoc } = auth as {
      user: { email?: string | null };
      currentDoc: NonNullable<Awaited<ReturnType<typeof getRiderDocumentById>>>;
    };

    const contentType = request.headers.get("content-type") || "";
    let docNumber: string | undefined;
    let file: File | null = null;
    let docNumberSent = false;
    let removeImage = false;
    let displayDocType: string = currentDoc.docType;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      docNumberSent = formData.has("docNumber");
      docNumber = docNumberSent ? ((formData.get("docNumber") as string | null) ?? undefined) : undefined;
      const rawFile = formData.get("file");
      file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
      removeImage = formData.get("removeImage") === "true";
      const display = formData.get("displayDocType");
      if (typeof display === "string" && display.trim()) {
        displayDocType = display.trim() as typeof displayDocType;
      }
    } else {
      const body = await request.json();
      docNumber = body.docNumber;
      docNumberSent = docNumber !== undefined;
      removeImage = Boolean(body.removeImage);
      if (typeof body.displayDocType === "string" && body.displayDocType.trim()) {
        displayDocType = body.displayDocType.trim() as typeof displayDocType;
      }
    }

    const previousValues = {
      docNumber: currentDoc.docNumber,
      fileUrl: currentDoc.fileUrl,
      r2Key: currentDoc.r2Key,
      displayDocType,
    };

    if (removeImage) {
      const updatedDoc = await removeRiderDocumentImage({
        riderId,
        documentId,
        displayDocType,
      });

      if (docNumberSent) {
        await updateRiderDocument(documentId, {
          docNumber: docNumber?.trim() ? docNumber.trim() : null,
        });
      }

      const agent = await getSystemUserByEmail(user.email ?? "");
      if (agent) {
        await logActionFromRequest(user.email ?? "", "RIDER", "RIDER_DOCUMENT_IMAGE_REMOVED", {
          resourceType: "RIDER_DOCUMENT",
          resourceId: documentId.toString(),
          previousValues,
          newValues: { displayDocType },
          actionDetails: { riderId, docType: currentDoc.docType, displayDocType },
          ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
          userAgent: request.headers.get("user-agent") || undefined,
          requestPath: request.nextUrl.pathname,
          requestMethod: "PUT",
        });
      }

      return NextResponse.json({
        success: true,
        data: updatedDoc,
        removed: true,
        displayDocType,
      });
    }

    if (file) {
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { success: false, error: "Invalid file type. Allowed types: JPEG, PNG, WebP, PDF" },
          { status: 400 }
        );
      }

      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: "File size exceeds 10MB limit" },
          { status: 400 }
        );
      }

      const updatedDoc = await uploadRiderDocumentImage({
        riderId,
        documentId,
        displayDocType,
        file,
        docNumber: docNumberSent ? (docNumber?.trim() ?? "") : undefined,
      });

      const agent = await getSystemUserByEmail(user.email ?? "");
      if (agent) {
        await logActionFromRequest(user.email ?? "", "RIDER", "RIDER_DOCUMENT_IMAGE_UPDATED", {
          resourceType: "RIDER_DOCUMENT",
          resourceId: documentId.toString(),
          previousValues,
          newValues: {
            docNumber: updatedDoc.docNumber,
            fileUrl: updatedDoc.fileUrl,
            r2Key: updatedDoc.r2Key,
            displayDocType,
          },
          actionDetails: { riderId, docType: currentDoc.docType, displayDocType },
          ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
          userAgent: request.headers.get("user-agent") || undefined,
          requestPath: request.nextUrl.pathname,
          requestMethod: "PUT",
        });
      }

      return NextResponse.json({
        success: true,
        data: updatedDoc,
        displayDocType,
      });
    }

    if (docNumberSent) {
      const updatedDoc = await updateRiderDocument(documentId, {
        docNumber: docNumber?.trim() ? docNumber.trim() : null,
      });

      return NextResponse.json({
        success: true,
        data: updatedDoc ?? currentDoc,
      });
    }

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

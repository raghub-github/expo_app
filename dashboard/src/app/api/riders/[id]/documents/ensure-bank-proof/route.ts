/**
 * POST /api/riders/[id]/documents/ensure-bank-proof
 * Create a stub bank_proof document so dashboard electronic verify can run
 * when the rider never uploaded a passbook (Cashfree-only path).
 */

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riderDocuments } from "@/lib/db/schema";
import { getRiderById } from "@/lib/db/operations/riders";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
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
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (Number.isNaN(riderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID" },
        { status: 400 },
      );
    }

    const rider = await getRiderById(riderId);
    if (!rider) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 },
      );
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(riderDocuments)
      .where(
        and(
          eq(riderDocuments.riderId, riderId),
          eq(riderDocuments.docType, "bank_proof"),
        ),
      )
      .orderBy(desc(riderDocuments.updatedAt))
      .limit(1);

    if (existing) {
      return NextResponse.json({
        success: true,
        data: {
          id: existing.id,
          docType: existing.docType,
          fileUrl: existing.fileUrl,
          r2Key: existing.r2Key,
          docNumber: existing.docNumber,
          verificationMethod: existing.verificationMethod,
          verified: existing.verified,
          verifierUserId: existing.verifierUserId,
          verifierName: null,
          rejectedReason: existing.rejectedReason,
          extractedName: existing.extractedName,
          extractedDob: existing.extractedDob
            ? String(existing.extractedDob).slice(0, 10)
            : null,
          extractedDataSummary: existing.extractedDataSummary ?? null,
          lastVerificationId: existing.lastVerificationId ?? null,
          lastProviderReference: existing.lastProviderReference ?? null,
          metadata: existing.metadata ?? null,
          verifiedAt: existing.verifiedAt?.toISOString?.() ?? null,
          createdAt: existing.createdAt.toISOString(),
          created: false,
        },
      });
    }

    const [created] = await db
      .insert(riderDocuments)
      .values({
        riderId,
        docType: "bank_proof",
        fileUrl: "electronic_verified",
        verificationMethod: "MANUAL_UPLOAD",
        verificationStatus: "pending",
        verified: false,
        requiresManualReview: true,
        metadata: { bankVerificationOnly: true, stubForElectronicVerify: true },
      })
      .returning();

    if (!created) {
      return NextResponse.json(
        { success: false, error: "Could not create bank proof stub" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        docType: created.docType,
        fileUrl: created.fileUrl,
        r2Key: created.r2Key,
        docNumber: created.docNumber,
        verificationMethod: created.verificationMethod,
        verified: created.verified,
        verifierUserId: created.verifierUserId,
        verifierName: null,
        rejectedReason: created.rejectedReason,
        extractedName: created.extractedName,
        extractedDob: null,
        extractedDataSummary: created.extractedDataSummary ?? null,
        lastVerificationId: created.lastVerificationId ?? null,
        lastProviderReference: created.lastProviderReference ?? null,
        metadata: created.metadata ?? null,
        verifiedAt: null,
        createdAt: created.createdAt.toISOString(),
        created: true,
      },
    });
  } catch (error) {
    console.error("[POST ensure-bank-proof]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

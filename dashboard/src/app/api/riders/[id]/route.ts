/**
 * Rider Management API Routes
 * GET /api/riders/[id] - Get rider details with all documents
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRiderWithDocuments, getRiderById, syncRiderOnboardingState, checkOnboardingPaymentCompleted, isRiderEligibleForApprovalQueue } from "@/lib/db/operations/riders";
import { expandRiderDocumentsForDashboard } from "@/lib/rider-document-display";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getDb } from "@/lib/db/client";
import { riderWallet, walletLedger, riderPenalties, withdrawalRequests, onboardingPayments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import {
  decryptRiderAccountNumber,
  maskRiderAccountNumber,
} from "@/lib/rider-bank-account-crypto";

export const runtime = 'nodejs';

/**
 * GET /api/riders/[id]
 * Get rider details with all documents
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Use getUser() instead of getSession() to avoid triggering token refresh unnecessarily
    // This prevents "refresh token already used" errors when multiple API calls happen simultaneously
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      // Check if it's an invalid refresh token error
      if (isInvalidRefreshToken(userError)) {
        await signOutIfSessionDead(supabase, userError);
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }
    
    // Create a session-like object for compatibility with existing code
    // We use getUser() instead of getSession() to avoid refresh token race conditions
    const session = { user };

    // Check if user is super admin or has RIDER dashboard access
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    const hasRiderAccess = await hasDashboardAccessByAuth(
      session.user.id,
      session.user.email!,
      "RIDER"
    );

    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. RIDER dashboard access required." },
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

    // Fetch rider with documents
    let riderData = await getRiderWithDocuments(riderId);
    if (!riderData) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 }
      );
    }

    // Auto-activate when all required docs are verified and payment is completed
    if (riderData.rider.status !== "ACTIVE" && riderData.rider.status !== "BLOCKED" && riderData.rider.status !== "BANNED") {
      await syncRiderOnboardingState(riderId);
      const refreshedRider = await getRiderById(riderId);
      if (refreshedRider) {
        riderData = { ...riderData, rider: refreshedRider };
      }
    }

    // Regenerate signed URLs for documents and their files (multi-file: front/back)
    function riderDocumentViewUrl(doc: { r2Key?: string | null; fileUrl?: string | null }): string {
      const raw = doc.r2Key?.trim() || doc.fileUrl?.trim() || "";
      return resolveAttachmentProxyUrl(raw);
    }

    const documentsWithUrls = riderData.documents.map((doc: any) => {
      const files = (doc.files || []).map(
        (f: { fileUrl: string; r2Key?: string | null; side?: string; id: number; sortOrder?: number }) => ({
          ...f,
          fileUrl: riderDocumentViewUrl(f),
        })
      );
      return {
        ...doc,
        fileUrl: riderDocumentViewUrl(doc),
        files,
      };
    });

    const documentsForUi = expandRiderDocumentsForDashboard(
      documentsWithUrls,
      riderData.rider
    );

    const { resolveRiderSelfieFromStored } = await import("@/lib/rider-selfie-url");
    const selfieFromRider = resolveRiderSelfieFromStored(
      (riderData.rider as { selfieUrl?: string | null })?.selfieUrl,
    );
    const selfieFromDoc = documentsWithUrls.find(
      (d: { docType?: string }) => d.docType === "selfie" || d.docType === "profile_photo",
    ) as { fileUrl?: string } | undefined;
    const riderForUi = {
      ...riderData.rider,
      selfieUrl:
        selfieFromRider ||
        resolveRiderSelfieFromStored(selfieFromDoc?.fileUrl) ||
        null,
    };

    const db = getDb();

    // Wallet (rider_wallet) – total balance, earnings by service, penalties, total_withdrawn
    const [walletRow] = await db
      .select()
      .from(riderWallet)
      .where(eq(riderWallet.riderId, riderId))
      .limit(1);

    // Recent wallet ledger (transaction history), last 30
    const ledgerRows = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.riderId, riderId))
      .orderBy(desc(walletLedger.createdAt))
      .limit(30);

    // Recent penalties
    const penaltiesRows = await db
      .select()
      .from(riderPenalties)
      .where(eq(riderPenalties.riderId, riderId))
      .orderBy(desc(riderPenalties.imposedAt))
      .limit(15);

    // Recent withdrawal requests
    const withdrawalsRows = await db
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.riderId, riderId))
      .orderBy(desc(withdrawalRequests.createdAt))
      .limit(15);

    // Onboarding payments (registration fees) – for wallet details and full details page.
    // Includes the amount breakdown + any refund info (reflected from the Razorpay
    // webhook) so the dashboard can show paid/refunded status and refunded amount.
    type DashboardOnboardingPayment = {
      id: number;
      riderId: number;
      amount: string;
      amountPaise: number;
      subtotalPaise: number | null;
      gstAmountPaise: number | null;
      gstPercentApplied: number | null;
      provider: string;
      refId: string;
      paymentId: string | null;
      razorpayPaymentId: string | null;
      status: string;
      refund: {
        status: string | null;
        refundId: string | null;
        amountPaise: number | null;
        partial: boolean;
        at: string | null;
      } | null;
      createdAt: string;
      updatedAt: string;
    };
    let onboardingPaymentsList: DashboardOnboardingPayment[] = [];
    try {
      const onboardingRows = await db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderId))
        .orderBy(desc(onboardingPayments.createdAt))
        .limit(50);
      const toIso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
      onboardingPaymentsList = onboardingRows.map((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const asStr = (v: unknown): string | null =>
          typeof v === "string" && v.length > 0 ? v : null;
        const asNum = (v: unknown): number | null =>
          typeof v === "number" && Number.isFinite(v) ? v : null;
        const hasRefund = r.status === "refunded" || meta.refundId != null;
        return {
          id: r.id,
          riderId: r.riderId,
          amount: String(r.amount),
          amountPaise: Math.round(Number(r.amount) * 100),
          subtotalPaise: r.subtotalPaise ?? null,
          gstAmountPaise: r.gstAmountPaise ?? null,
          gstPercentApplied: r.gstPercentApplied != null ? Number(r.gstPercentApplied) : null,
          provider: r.provider,
          refId: r.refId,
          paymentId: r.paymentId ?? null,
          razorpayPaymentId:
            asStr(meta.razorpayPaymentId) ?? (r.status === "completed" ? r.paymentId ?? null : null),
          status: r.status,
          refund: hasRefund
            ? {
                status: asStr(meta.refundStatus),
                refundId: asStr(meta.refundId),
                amountPaise: asNum(meta.refundedAmountPaise),
                partial: meta.refundPartial === true,
                at: asStr(meta.refundUpdatedAt),
              }
            : null,
          createdAt: toIso(r.createdAt),
          updatedAt: toIso(r.updatedAt),
        };
      });
    } catch {
      // Table may not exist in some envs
    }

    const totalBal = walletRow ? Number(walletRow.totalBalance) : 0;
    const wallet = walletRow ? {
      totalBalance: walletRow.totalBalance,
      globalWalletBlock: totalBal <= -200,
      earningsFood: walletRow.earningsFood,
      earningsParcel: walletRow.earningsParcel,
      earningsPersonRide: walletRow.earningsPersonRide,
      penaltiesFood: walletRow.penaltiesFood,
      penaltiesParcel: walletRow.penaltiesParcel,
      penaltiesPersonRide: walletRow.penaltiesPersonRide,
      totalWithdrawn: walletRow.totalWithdrawn,
      lastUpdatedAt: walletRow.lastUpdatedAt,
    } : null;

    const recentLedger = ledgerRows.map((row) => ({
      id: row.id,
      riderId: row.riderId,
      entryType: row.entryType,
      amount: row.amount,
      balance: row.balance,
      serviceType: row.serviceType,
      ref: row.ref,
      refType: row.refType,
      description: row.description,
      createdAt: row.createdAt,
    }));

    const recentPenalties = penaltiesRows.map((row) => ({
      id: row.id,
      orderId: row.orderId ?? null,
      serviceType: row.serviceType,
      penaltyType: row.penaltyType,
      amount: row.amount,
      reason: row.reason,
      status: row.status,
      imposedAt: row.imposedAt,
      resolvedAt: row.resolvedAt,
    }));

    const recentWithdrawals = withdrawalsRows.map((row) => ({
      id: row.id,
      amount: row.amount,
      status: row.status,
      bankAcc: row.bankAcc,
      ifsc: row.ifsc,
      accountHolderName: row.accountHolderName,
      transactionId: row.transactionId,
      failureReason: row.failureReason ?? null,
      processedAt: row.processedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    const [paymentCompleted, approvalQueueEligible] = await Promise.all([
      checkOnboardingPaymentCompleted(riderId),
      isRiderEligibleForApprovalQueue(riderId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        rider: riderForUi,
        paymentCompleted,
        approvalQueueEligible,
        documents: documentsForUi,
        addresses: riderData.addresses ?? [],
        vehicle: riderData.vehicle
          ? {
              id: riderData.vehicle.id,
              vehicleType: riderData.vehicle.vehicleType,
              registrationNumber: riderData.vehicle.registrationNumber,
              registrationState: riderData.vehicle.registrationState ?? null,
              make: riderData.vehicle.make,
              model: riderData.vehicle.model,
              year: riderData.vehicle.year,
              color: riderData.vehicle.color,
              fuelType: riderData.vehicle.fuelType,
              vehicleCategory: riderData.vehicle.vehicleCategory,
              acType: riderData.vehicle.acType,
              isCommercial: riderData.vehicle.isCommercial ?? false,
              permitExpiry: riderData.vehicle.permitExpiry ?? null,
              insuranceExpiry: riderData.vehicle.insuranceExpiry ?? null,
              vehicleActiveStatus: riderData.vehicle.vehicleActiveStatus ?? "active",
              seatingCapacity: riderData.vehicle.seatingCapacity ?? null,
              serviceTypes: riderData.vehicle.serviceTypes ?? [],
              verified: riderData.vehicle.verified ?? false,
              verifiedAt: riderData.vehicle.verifiedAt ?? null,
              isActive: riderData.vehicle.isActive ?? true,
            }
          : null,
        paymentMethods: (riderData.paymentMethods || []).map((pm: any) => {
          const decrypted = pm.accountNumberEncrypted
            ? decryptRiderAccountNumber(pm.accountNumberEncrypted)
            : null;
          return {
            id: pm.id,
            methodType: pm.methodType,
            accountHolderName: pm.accountHolderName,
            bankName: pm.bankName ?? null,
            ifsc: pm.ifsc ?? null,
            branch: pm.branch ?? null,
            accountNumberMasked: decrypted
              ? maskRiderAccountNumber(decrypted)
              : null,
            upiId: pm.upiId ?? null,
            verificationStatus: pm.verificationStatus,
            verificationProofType: pm.verificationProofType ?? null,
            verifiedAt: pm.verifiedAt ?? null,
            createdAt: pm.createdAt,
          };
        }),
        wallet,
        recentLedger,
        recentPenalties,
        recentWithdrawals,
        onboardingPayments: onboardingPaymentsList,
      },
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

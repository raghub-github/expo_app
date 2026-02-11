/**
 * Rider Management API Routes
 * GET /api/riders/[id] - Get rider details with all documents
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRiderWithDocuments } from "@/lib/db/operations/riders";
import { getSignedUrlFromKey } from "@/lib/services/r2";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getDb } from "@/lib/db/client";
import { riderWallet, walletLedger, riderPenalties, withdrawalRequests, onboardingPayments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

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
        await supabase.auth.signOut();
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
    const riderData = await getRiderWithDocuments(riderId);
    if (!riderData) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 }
      );
    }

    // Regenerate signed URLs for documents and their files (multi-file: front/back)
    const documentsWithUrls = await Promise.all(
      riderData.documents.map(async (doc: any) => {
        let fileUrl = doc.fileUrl;
        if (doc.verificationMethod === "MANUAL_UPLOAD" && doc.r2Key) {
          try {
            fileUrl = await getSignedUrlFromKey(doc.r2Key);
          } catch (error) {
            console.error(`[GET /api/riders/${riderId}] Failed to regenerate signed URL for doc ${doc.id}:`, error);
          }
        }
        const files = (doc.files || []).map((f: { fileUrl: string; r2Key?: string | null; side?: string; id: number; sortOrder?: number }) => ({ ...f }));
        const filesWithUrls = await Promise.all(
          files.map(async (f: { fileUrl: string; r2Key?: string | null; side?: string; id: number }) => {
            if (f.r2Key) {
              try {
                return { ...f, fileUrl: await getSignedUrlFromKey(f.r2Key) };
              } catch {
                return f;
              }
            }
            return f;
          })
        );
        return { ...doc, fileUrl, files: filesWithUrls };
      })
    );

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

    // Onboarding payments (registration fees) – for wallet details and full details page
    let onboardingPaymentsList: { id: number; riderId: number; amount: string; provider: string; refId: string; paymentId: string | null; status: string; createdAt: string }[] = [];
    try {
      const onboardingRows = await db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderId))
        .orderBy(desc(onboardingPayments.createdAt))
        .limit(50);
      onboardingPaymentsList = onboardingRows.map((r) => ({
        id: r.id,
        riderId: r.riderId,
        amount: String(r.amount),
        provider: r.provider,
        refId: r.refId,
        paymentId: r.paymentId ?? null,
        status: r.status,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }));
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
      processedAt: row.processedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        rider: riderData.rider,
        documents: documentsWithUrls,
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
        paymentMethods: (riderData.paymentMethods || []).map((pm: any) => ({
          id: pm.id,
          methodType: pm.methodType,
          accountHolderName: pm.accountHolderName,
          bankName: pm.bankName ?? null,
          ifsc: pm.ifsc ?? null,
          branch: pm.branch ?? null,
          accountNumberMasked: pm.accountNumberEncrypted ? "••••" : null,
          upiId: pm.upiId ?? null,
          verificationStatus: pm.verificationStatus,
          verificationProofType: pm.verificationProofType ?? null,
          verifiedAt: pm.verifiedAt ?? null,
          createdAt: pm.createdAt,
        })),
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

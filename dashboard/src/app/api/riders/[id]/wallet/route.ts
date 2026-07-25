/**
 * GET /api/riders/[id]/wallet – lightweight wallet summary for dashboard (no documents/KYC).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, riderWallet, onboardingPayments, walletLedger } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email ?? "", "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (!Number.isFinite(riderId) || riderId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const db = getDb();

    const fetchOnboarding = async () => {
      try {
        return await db
          .select({
            id: onboardingPayments.id,
            riderId: onboardingPayments.riderId,
            amount: onboardingPayments.amount,
            provider: onboardingPayments.provider,
            refId: onboardingPayments.refId,
            paymentId: onboardingPayments.paymentId,
            status: onboardingPayments.status,
            metadata: onboardingPayments.metadata,
            createdAt: onboardingPayments.createdAt,
          })
          .from(onboardingPayments)
          .where(eq(onboardingPayments.riderId, riderId))
          .orderBy(desc(onboardingPayments.createdAt))
          .limit(20);
      } catch {
        return [];
      }
    };

    const [[rider], [walletRow], onboardingRows] = await Promise.all([
      db
        .select({ id: riders.id, name: riders.name, mobile: riders.mobile })
        .from(riders)
        .where(eq(riders.id, riderId))
        .limit(1),
      db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1),
      fetchOnboarding(),
    ]);

    if (!rider) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    const totalBal = walletRow ? Number(walletRow.totalBalance) : 0;
    type WalletPayload = {
      totalBalance: string;
      globalWalletBlock: boolean;
      earningsFood: string;
      earningsParcel: string;
      earningsPersonRide: string;
      penaltiesFood: string;
      penaltiesParcel: string;
      penaltiesPersonRide: string;
      totalWithdrawn: string;
      lastUpdatedAt: Date | null;
    };
    let wallet: WalletPayload | null = walletRow
      ? {
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
        }
      : null;

    if (!wallet) {
      const [latestLedger] = await db
        .select({ balance: walletLedger.balance })
        .from(walletLedger)
        .where(eq(walletLedger.riderId, riderId))
        .orderBy(desc(walletLedger.createdAt))
        .limit(1);
      const ledgerBalance = latestLedger?.balance != null ? Number(latestLedger.balance) : NaN;
      if (Number.isFinite(ledgerBalance)) {
        wallet = {
          totalBalance: ledgerBalance.toFixed(2),
          globalWalletBlock: ledgerBalance <= -200,
          earningsFood: "0",
          earningsParcel: "0",
          earningsPersonRide: "0",
          penaltiesFood: "0",
          penaltiesParcel: "0",
          penaltiesPersonRide: "0",
          totalWithdrawn: "0",
          lastUpdatedAt: null,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        rider: {
          id: rider.id,
          name: rider.name,
          mobile: rider.mobile,
        },
        wallet,
        onboardingPayments: onboardingRows.map((r) => {
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
            provider: r.provider,
            refId: r.refId,
            paymentId: r.paymentId ?? null,
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
            createdAt:
              r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
          };
        }),
      },
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/wallet] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

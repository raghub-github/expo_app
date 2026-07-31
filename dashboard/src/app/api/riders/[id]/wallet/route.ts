/**
 * GET /api/riders/[id]/wallet – lightweight wallet summary for dashboard (no documents/KYC).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, riderWallet, onboardingPayments, walletLedger } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
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

    // Per-service breakdown (mirrors backend getRiderWalletBreakdown): earnings +
    // penalties from the authoritative wallet columns; penalty reverts + offers
    // aggregated from wallet_ledger via service_type. Keeps app + dashboard identical.
    const n2 = (v: unknown) => {
      const x = Number(v ?? 0);
      return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
    };
    const svcKey = (raw: unknown): "food" | "parcel" | "ride" | null => {
      const s = String(raw ?? "").toLowerCase();
      if (s === "food") return "food";
      if (s === "parcel") return "parcel";
      if (s === "ride" || s === "person_ride") return "ride";
      return null;
    };
    type SvcBreakdown = { earnings: number; penalties: number; penaltyReverts: number; offers: number; net: number };
    const mk = (e: unknown, p: unknown): SvcBreakdown => ({ earnings: n2(e), penalties: n2(p), penaltyReverts: 0, offers: 0, net: 0 });
    const breakdown = {
      food: mk(walletRow?.earningsFood, walletRow?.penaltiesFood),
      parcel: mk(walletRow?.earningsParcel, walletRow?.penaltiesParcel),
      ride: mk(walletRow?.earningsPersonRide, walletRow?.penaltiesPersonRide),
      common: { otherOffers: 0, otherPenaltyReverts: 0 },
    };
    try {
      const rows = (await db.execute(sql`
        SELECT
          LOWER(COALESCE(NULLIF(service_type, ''), metadata->>'serviceType', metadata->>'service_type', '')) AS svc,
          LOWER(entry_type::text) AS et,
          COALESCE(SUM(amount::numeric), 0) AS total
        FROM wallet_ledger
        WHERE rider_id = ${riderId}
          AND LOWER(entry_type::text) IN ('penalty_reversal', 'cancellation_payout', 'bonus', 'referral_bonus')
        GROUP BY 1, 2
      `)) as unknown as { rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
      for (const r of list) {
        const amt = n2(r.total);
        if (amt <= 0) continue;
        const key = svcKey(r.svc);
        const bucket = key === "food" ? breakdown.food : key === "parcel" ? breakdown.parcel : key === "ride" ? breakdown.ride : null;
        if (String(r.et) === "penalty_reversal") {
          if (bucket) bucket.penaltyReverts += amt;
          else breakdown.common.otherPenaltyReverts += amt;
        } else {
          if (bucket) bucket.offers += amt;
          else breakdown.common.otherOffers += amt;
        }
      }
    } catch {
      // best-effort; earnings/penalties from columns still stand
    }
    for (const b of [breakdown.food, breakdown.parcel, breakdown.ride]) {
      b.penaltyReverts = n2(b.penaltyReverts);
      b.offers = n2(b.offers);
      b.net = n2(b.earnings - b.penalties + b.penaltyReverts + b.offers);
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
        breakdown,
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

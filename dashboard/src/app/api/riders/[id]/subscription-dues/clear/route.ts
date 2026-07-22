/**
 * POST /api/riders/[id]/subscription-dues/clear
 * Admin clears outstanding subscription dues:
 * - Debits wallet by the cleared amount (balance goes more negative)
 * - Writes wallet_ledger subscription_fee entry
 * - Records rider_subscription_dues_admin_clears audit row
 * - Zeros subscription_dues_outstanding and unblocks dispatch
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb, getSql } from "@/lib/db/client";
import { riders, riderWallet, walletLedger } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformRiderActionAnyService } from "@/lib/permissions/actions";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { logActionByAuth } from "@/lib/audit/logger";
import { GLOBAL_BLOCK_THRESHOLD } from "@/lib/rider-negative-wallet-blocks";
import { deleteCachedByPrefix } from "@/lib/server-cache";
import { getRedisClient } from "@/lib/redis";

export const runtime = "nodejs";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(
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
    const canClear =
      userIsSuperAdmin ||
      (hasRiderAccess && (await canPerformRiderActionAnyService(user.id, user.email ?? "", "UPDATE")));
    if (!canClear) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions to clear subscription dues." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (!Number.isFinite(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const db = getDb();
    const sql = getSql();

    const [rider] = await db.select({ id: riders.id }).from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!rider) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    let duesOutstanding = 0;
    let dispatchBlocked = false;
    let penaltyStreakDays = 0;
    try {
      const rows = await sql`
        SELECT
          COALESCE(subscription_dues_outstanding, 0)::float8 AS dues_outstanding,
          COALESCE(subscription_dispatch_blocked, FALSE) AS dispatch_blocked,
          COALESCE(subscription_penalty_streak_days, 0)::int AS penalty_streak_days
        FROM riders
        WHERE id = ${riderId}
        LIMIT 1
      `;
      const row = rows?.[0] as
        | {
            dues_outstanding?: unknown;
            dispatch_blocked?: unknown;
            penalty_streak_days?: unknown;
          }
        | undefined;
      duesOutstanding = round2(Number(row?.dues_outstanding ?? 0));
      dispatchBlocked = Boolean(row?.dispatch_blocked);
      penaltyStreakDays = Math.max(0, Number(row?.penalty_streak_days ?? 0) || 0);
    } catch (err) {
      console.error("[clear-subscription-dues] read dues failed", err);
      return NextResponse.json(
        { success: false, error: "Subscription dues columns unavailable" },
        { status: 500 }
      );
    }

    if (duesOutstanding <= 0 && !dispatchBlocked) {
      return NextResponse.json({
        success: true,
        data: {
          clearedAmount: 0,
          duesOutstandingAfter: 0,
          alreadyClear: true,
        },
      });
    }

    const clearAmount = Math.max(0, duesOutstanding);

    let [wallet] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
    if (!wallet) {
      await db.insert(riderWallet).values({
        riderId,
        totalBalance: "0",
        earningsFood: "0",
        earningsParcel: "0",
        earningsPersonRide: "0",
        penaltiesFood: "0",
        penaltiesParcel: "0",
        penaltiesPersonRide: "0",
        totalWithdrawn: "0",
      });
      [wallet] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1);
    }

    const currentBalance = round2(Number(wallet?.totalBalance ?? 0));
    const balanceAfter = round2(currentBalance - clearAmount);
    const systemUser = await getSystemUserByEmail(user.email ?? "");
    const ref = `admin_clear_sub_dues_${riderId}_${Date.now()}`;
    let walletLedgerId: number | null = null;

    if (clearAmount > 0) {
      // Insert ledger debit — DB trigger subtracts from rider_wallet; then ensure exact balance.
      const inserted = await db
        .insert(walletLedger)
        .values({
          riderId,
          entryType: "subscription_fee",
          amount: clearAmount.toFixed(2),
          balance: balanceAfter >= 0 ? balanceAfter.toFixed(2) : null,
          serviceType: null,
          ref,
          refType: "subscription",
          description: "Subscription dues cleared by admin (wallet debit)",
          metadata: {
            source: "dashboard_clear_subscription_dues",
            duesOutstandingBefore: clearAmount,
            adminCleared: true,
          },
          performedByType: "agent",
          performedById: systemUser?.id ?? null,
        })
        .returning({ id: walletLedger.id });

      walletLedgerId = inserted[0]?.id ?? null;

      await db
        .update(riderWallet)
        .set({
          totalBalance: balanceAfter.toFixed(2),
          lastUpdatedAt: new Date(),
        })
        .where(eq(riderWallet.riderId, riderId));
    }

    try {
      await sql`
        UPDATE riders
        SET
          subscription_dues_outstanding = 0,
          subscription_dispatch_blocked = FALSE,
          subscription_dispatch_blocked_at = NULL,
          subscription_penalty_streak_days = 0,
          subscription_penalty_last_date = NULL,
          updated_at = NOW()
        WHERE id = ${riderId}
      `;
    } catch (err) {
      console.error("[clear-subscription-dues] update riders failed", err);
      return NextResponse.json(
        { success: false, error: "Failed to clear subscription dues flags" },
        { status: 500 }
      );
    }

    // Dedicated admin-clear audit row (requires migration 0423).
    let adminClearId: number | null = null;
    try {
      const clearRows = await sql`
        INSERT INTO rider_subscription_dues_admin_clears (
          rider_id,
          cleared_amount,
          dues_outstanding_before,
          wallet_balance_before,
          wallet_balance_after,
          dispatch_blocked_before,
          penalty_streak_days_before,
          wallet_ledger_id,
          wallet_ledger_ref,
          cleared_by_system_user_id,
          cleared_by_email,
          cleared_by_name,
          cleared_by_auth_id,
          note,
          metadata
        ) VALUES (
          ${riderId},
          ${clearAmount},
          ${duesOutstanding},
          ${currentBalance},
          ${balanceAfter},
          ${dispatchBlocked},
          ${penaltyStreakDays},
          ${walletLedgerId},
          ${ref},
          ${systemUser?.id ?? null},
          ${user.email ?? null},
          ${systemUser?.fullName ?? null},
          ${user.id},
          ${"Cleared from rider dashboard Subscription Dues card"},
          ${JSON.stringify({
            source: "dashboard_clear_subscription_dues",
            globalWalletBlockAfter: balanceAfter <= GLOBAL_BLOCK_THRESHOLD,
          })}::jsonb
        )
        RETURNING id
      `;
      adminClearId = Number((clearRows?.[0] as { id?: unknown } | undefined)?.id ?? 0) || null;
    } catch (err) {
      console.error(
        "[clear-subscription-dues] admin clear audit insert failed — run migration 0423_rider_subscription_dues_admin_clears.sql",
        err
      );
    }

    // Bust summary caches so wallet + dues refresh immediately on refetch.
    deleteCachedByPrefix(`rider_summary_v5:${riderId}:`);
    try {
      const redis = getRedisClient();
      if (redis) {
        const keys = await redis.keys(`rider_summary_v5:${riderId}:*`);
        if (keys.length > 0) await redis.del(...keys);
      }
    } catch {
      // ignore cache flush errors
    }

    await logActionByAuth(user.id, user.email ?? "", "RIDER", "RIDER_SUBSCRIPTION_DUES_CLEARED", {
      resourceType: "rider",
      resourceId: String(riderId),
      actionDetails: {
        riderId,
        clearedAmount: clearAmount,
        balanceBefore: currentBalance,
        balanceAfter,
        dispatchBlockedBefore: dispatchBlocked,
        adminClearId,
        walletLedgerId,
      },
      newValues: {
        subscription_dues_outstanding: 0,
        subscription_dispatch_blocked: false,
        totalBalance: balanceAfter,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        clearedAmount: clearAmount,
        duesOutstandingAfter: 0,
        dispatchBlockedAfter: false,
        totalBalance: balanceAfter,
        globalWalletBlock: balanceAfter <= GLOBAL_BLOCK_THRESHOLD,
        adminClearId,
        walletLedgerId,
      },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/subscription-dues/clear] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to clear subscription dues" },
      { status: 500 }
    );
  }
}

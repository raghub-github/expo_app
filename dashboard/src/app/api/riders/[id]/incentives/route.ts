/**
 * GET /api/riders/[id]/incentives
 * Rider incentives, surges, bonuses (wallet ledger) + program progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb, getSql } from "@/lib/db/client";
import { riders, walletLedger } from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

const INCENTIVE_ENTRY_TYPES = ["incentive", "surge", "bonus", "referral_bonus"] as const;

function money(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

export async function GET(
  request: NextRequest,
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
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, email, "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (!Number.isFinite(riderId) || riderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID" },
        { status: 400 },
      );
    }

    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "40");
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 40, 1), 100);

    const db = getDb();

    const [rider] = await db
      .select({ id: riders.id, name: riders.name, mobile: riders.mobile })
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);

    if (!rider) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 },
      );
    }

    const [totalsRow] = await db
      .select({
        incentiveTotal: sql<string>`coalesce(sum(case when ${walletLedger.entryType}::text = 'incentive' then ${walletLedger.amount}::numeric else 0 end), 0)`,
        surgeTotal: sql<string>`coalesce(sum(case when ${walletLedger.entryType}::text = 'surge' then ${walletLedger.amount}::numeric else 0 end), 0)`,
        bonusTotal: sql<string>`coalesce(sum(case when ${walletLedger.entryType}::text = 'bonus' then ${walletLedger.amount}::numeric else 0 end), 0)`,
        referralBonusTotal: sql<string>`coalesce(sum(case when ${walletLedger.entryType}::text = 'referral_bonus' then ${walletLedger.amount}::numeric else 0 end), 0)`,
        entryCount: sql<number>`count(*)::int`,
      })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.riderId, riderId),
          inArray(walletLedger.entryType, [...INCENTIVE_ENTRY_TYPES]),
        ),
      );

    const entries = await db
      .select({
        id: walletLedger.id,
        entryType: walletLedger.entryType,
        amount: walletLedger.amount,
        serviceType: walletLedger.serviceType,
        description: walletLedger.description,
        ref: walletLedger.ref,
        refType: walletLedger.refType,
        createdAt: walletLedger.createdAt,
      })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.riderId, riderId),
          inArray(walletLedger.entryType, [...INCENTIVE_ENTRY_TYPES]),
        ),
      )
      .orderBy(desc(walletLedger.createdAt))
      .limit(limit);

    let programs: Array<{
      progressId: string;
      programId: string;
      programCode: string | null;
      programName: string | null;
      service: string;
      riderStatus: string;
      completedOrders: number;
      projectedReward: string | null;
      finalReward: string | null;
      payoutStatus: string | null;
      rankPosition: number | null;
      cycleStartAt: string;
      cycleEndAt: string;
      visible: boolean;
      winnerSelected: boolean;
      disqualified: boolean;
      cycleCount: number;
    }> = [];

    try {
      const sqlClient = getSql();
      const rows = await sqlClient<
        Array<{
          progress_id: string;
          program_id: string;
          program_code: string | null;
          program_name: string | null;
          service: string;
          rider_status: string;
          completed_orders: number;
          projected_reward: string | null;
          final_reward: string | null;
          payout_status: string | null;
          rank_position: number | null;
          cycle_start_at: string;
          cycle_end_at: string;
          visible: boolean;
          winner_selected: boolean;
          disqualified: boolean;
          cycle_count: number;
        }>
      >`
        SELECT DISTINCT ON (rip.program_id)
          rip.id::text AS progress_id,
          rip.program_id::text AS program_id,
          p.code AS program_code,
          p.name AS program_name,
          rip.service,
          rip.rider_status,
          rip.completed_orders,
          rip.projected_reward::text AS projected_reward,
          rip.final_reward::text AS final_reward,
          rip.payout_status,
          rip.rank_position,
          rip.cycle_start_at::text AS cycle_start_at,
          rip.cycle_end_at::text AS cycle_end_at,
          rip.visible,
          rip.winner_selected,
          rip.disqualified,
          (
            SELECT COUNT(*)::int
            FROM rider_incentive_progress rip2
            WHERE rip2.rider_id = rip.rider_id
              AND rip2.program_id = rip.program_id
          ) AS cycle_count
        FROM rider_incentive_progress rip
        LEFT JOIN incentive_programs p ON p.id = rip.program_id
        WHERE rip.rider_id = ${riderId}
        ORDER BY rip.program_id, rip.updated_at DESC NULLS LAST, rip.cycle_start_at DESC
        LIMIT 30
      `;

      programs = rows
        .map((r) => ({
          progressId: r.progress_id,
          programId: r.program_id,
          programCode: r.program_code,
          programName: r.program_name,
          service: r.service,
          riderStatus: r.rider_status,
          completedOrders: Number(r.completed_orders) || 0,
          projectedReward: r.projected_reward,
          finalReward: r.final_reward,
          payoutStatus: r.payout_status,
          rankPosition: r.rank_position,
          cycleStartAt: r.cycle_start_at,
          cycleEndAt: r.cycle_end_at,
          visible: Boolean(r.visible),
          winnerSelected: Boolean(r.winner_selected),
          disqualified: Boolean(r.disqualified),
          cycleCount: Number(r.cycle_count) || 1,
        }))
        .sort(
          (a, b) =>
            new Date(b.cycleStartAt).getTime() - new Date(a.cycleStartAt).getTime(),
        );
    } catch (err) {
      console.warn("[GET /api/riders/[id]/incentives] program progress skipped:", err);
      programs = [];
    }

    const incentiveTotal = money(totalsRow?.incentiveTotal);
    const surgeTotal = money(totalsRow?.surgeTotal);
    const bonusTotal = money(totalsRow?.bonusTotal);
    const referralBonusTotal = money(totalsRow?.referralBonusTotal);
    const combinedTotal = money(
      Number(incentiveTotal) +
        Number(surgeTotal) +
        Number(bonusTotal) +
        Number(referralBonusTotal),
    );

    return NextResponse.json({
      success: true,
      data: {
        rider,
        summary: {
          incentiveTotal,
          surgeTotal,
          bonusTotal,
          referralBonusTotal,
          combinedTotal,
          entryCount: Number(totalsRow?.entryCount) || 0,
          programCount: programs.length,
        },
        entries: entries.map((e) => ({
          id: e.id,
          entryType: e.entryType,
          amount: money(e.amount),
          serviceType: e.serviceType,
          description: e.description,
          ref: e.ref,
          refType: e.refType,
          createdAt:
            e.createdAt instanceof Date
              ? e.createdAt.toISOString()
              : String(e.createdAt),
        })),
        programs,
      },
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/incentives] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load incentives" },
      { status: 500 },
    );
  }
}

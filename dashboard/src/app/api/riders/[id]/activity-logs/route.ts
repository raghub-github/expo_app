/**
 * GET /api/riders/[id]/activity-logs
 * Rider activity: login time, service, orders completed/cancelled, earnings (orders, offers, incentives)
 * Query: from, to (YYYY-MM-DD), period (day|week|month|year), serviceType (all|food|parcel|person_ride)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import {
  riders,
  dutyLogs,
  ordersCore,
  orders,
  walletLedger,
} from "@/lib/db/schema";
import { eq, and, gte, lte, lt, desc } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import {
  aggregateDutyLoginByDayService,
  buildDutySessions,
  riderActivityDayKey,
} from "@/lib/riders/aggregate-rider-duty-login";

export const runtime = "nodejs";

function parseDate(s: string): Date {
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? new Date() : d;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
        { status: 401 }
      );
    }

    const userIsSuperAdmin = await isSuperAdmin(
      user.id,
      user.email ?? ""
    );
    const hasRiderAccess = await hasDashboardAccessByAuth(
      user.id,
      user.email ?? "",
      "RIDER"
    );
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions." },
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

    const db = getDb();
    const [riderRow] = await db
      .select()
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);
    if (!riderRow) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from") || "";
    const toParam = searchParams.get("to") || "";
    const period = searchParams.get("period") || "day"; // day | week | month | year
    const serviceFilter =
      searchParams.get("serviceType") || "all"; // all | food | parcel | person_ride
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    const now = new Date();
    let fromDate: Date;
    let toDate: Date;
    if (fromParam && toParam) {
      fromDate = parseDate(fromParam);
      toDate = endOfDay(parseDate(toParam));
    } else {
      toDate = endOfDay(now);
      if (period === "year") {
        fromDate = new Date(now.getFullYear(), 0, 1);
      } else if (period === "month") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === "week") {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        fromDate = new Date(now.getFullYear(), now.getMonth(), diff);
      } else {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
    }

    const useOrdersCore =
      process.env.USE_ORDERS_CORE === "true" ||
      process.env.USE_ORDERS_CORE === "1";

    // --- 1) Duty logs: build sessions (ON -> OFF) and aggregate by day + service
    const [priorDutyRow] = await db
      .select({
        status: dutyLogs.status,
        serviceTypes: dutyLogs.serviceTypes,
        timestamp: dutyLogs.timestamp,
      })
      .from(dutyLogs)
      .where(and(eq(dutyLogs.riderId, riderId), lt(dutyLogs.timestamp, fromDate)))
      .orderBy(desc(dutyLogs.timestamp))
      .limit(1);

    const dutyRows = await db
      .select({
        status: dutyLogs.status,
        serviceTypes: dutyLogs.serviceTypes,
        timestamp: dutyLogs.timestamp,
      })
      .from(dutyLogs)
      .where(
        and(
          eq(dutyLogs.riderId, riderId),
          gte(dutyLogs.timestamp, fromDate),
          lte(dutyLogs.timestamp, toDate)
        )
      )
      .orderBy(dutyLogs.timestamp);

    const sessions = buildDutySessions(dutyRows, priorDutyRow);
    const dayLogin = aggregateDutyLoginByDayService(sessions, fromDate, toDate, now);

    const dayKey = riderActivityDayKey;

    // --- 2) Orders: by date + service (orderType) — completed, cancelled, earnings
    const ordersTable = useOrdersCore ? ordersCore : orders;
    const riderIdCol = ordersTable.riderId;
    const createdAtCol = ordersTable.createdAt;
    const orderTypeCol = (ordersTable as typeof ordersCore).orderType;
    const statusCol = (ordersTable as typeof ordersCore).status;
    const riderEarningCol = (ordersTable as typeof ordersCore).riderEarning;

    let orderRows: Array<{
      createdAt: Date | string | null;
      orderType?: string | null;
      status?: string | null;
      riderEarning?: string | number | null;
    }> = [];

    try {
      orderRows = await db
        .select({
          createdAt: createdAtCol,
          orderType: orderTypeCol,
          status: statusCol,
          riderEarning: riderEarningCol,
        })
        .from(ordersTable)
        .where(
          and(
            eq(riderIdCol, riderId),
            gte(createdAtCol, fromDate),
            lte(createdAtCol, toDate)
          )
        )
        .orderBy(createdAtCol);
    } catch (orderErr) {
      console.warn(
        "[GET /api/riders/[id]/activity-logs] Orders query failed:",
        orderErr
      );
    }

    const dayOrders: Record<
      string,
      Record<
        string,
        { completed: number; cancelled: number; earningsOrders: number }
      >
    > = {};
    for (const row of orderRows) {
      if (!row.createdAt) continue;
      const day = dayKey(
        row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
      );
      const svc = String((row as { orderType?: string }).orderType || "food").toLowerCase();
      if (!dayOrders[day]) dayOrders[day] = {};
      if (!dayOrders[day][svc]) {
        dayOrders[day][svc] = { completed: 0, cancelled: 0, earningsOrders: 0 };
      }
      const st = String((row as { status?: string }).status || "").toLowerCase();
      if (st === "delivered") {
        dayOrders[day][svc].completed += 1;
        const amt = (row as { riderEarning?: string | number | null }).riderEarning;
        dayOrders[day][svc].earningsOrders += Number(amt) || 0;
      } else if (st === "cancelled") {
        dayOrders[day][svc].cancelled += 1;
      }
    }

    // --- 3) Wallet ledger: offers (bonus, referral_bonus), incentives (incentive, surge) by date + service
    const ledgerRows = await db
      .select({
        createdAt: walletLedger.createdAt,
        entryType: walletLedger.entryType,
        amount: walletLedger.amount,
        serviceType: walletLedger.serviceType,
      })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.riderId, riderId),
          gte(walletLedger.createdAt, fromDate),
          lte(walletLedger.createdAt, toDate)
        )
      );

    const dayLedger: Record<
      string,
      Record<
        string,
        { offers: number; incentives: number }
      >
    > = {};
    const offerTypes = ["bonus", "referral_bonus"];
    const incentiveTypes = ["incentive", "surge"];
    for (const row of ledgerRows) {
      if (!row.createdAt) continue;
      const day = dayKey(
        row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
      );
      const svc = (row.serviceType || "food").toString().toLowerCase();
      const svcNorm = ["food", "parcel", "person_ride"].includes(svc) ? svc : "food";
      if (!dayLedger[day]) dayLedger[day] = {};
      if (!dayLedger[day][svcNorm]) {
        dayLedger[day][svcNorm] = { offers: 0, incentives: 0 };
      }
      const amt = Number(row.amount) || 0;
      const et = String(row.entryType || "").toLowerCase();
      if (offerTypes.includes(et)) dayLedger[day][svcNorm].offers += amt;
      else if (incentiveTypes.includes(et)) dayLedger[day][svcNorm].incentives += amt;
    }

    // --- Build response rows: one per day per service (or per day if service = all)
    const servicesList = ["food", "parcel", "person_ride"] as const;
    const daysSet = new Set<string>();
    for (const d of Object.keys(dayLogin)) daysSet.add(d);
    for (const d of Object.keys(dayOrders)) daysSet.add(d);
    for (const d of Object.keys(dayLedger)) daysSet.add(d);

    const rows: Array<{
      date: string;
      serviceType: string;
      totalLoginSeconds: number;
      firstLoginAt: string | null;
      lastLogoutAt: string | null;
      ordersCompleted: number;
      ordersCancelled: number;
      earningsOrders: number;
      earningsOffers: number;
      earningsIncentives: number;
    }> = [];

    const sortedDays = Array.from(daysSet).sort();

    for (const day of sortedDays) {
      const svcs =
        serviceFilter === "all"
          ? servicesList
          : [serviceFilter as (typeof servicesList)[number]];

      for (const svc of svcs) {
        const login = dayLogin[day]?.[svc];
        const ord = dayOrders[day]?.[svc];
        const led = dayLedger[day]?.[svc];

        const totalLoginSeconds = login?.totalLoginSeconds ?? 0;
        const firstLoginAt = login?.firstLoginAt?.toISOString() ?? null;
        const lastLogoutAt = login?.lastLogoutAt?.toISOString() ?? null;
        const ordersCompleted = ord?.completed ?? 0;
        const ordersCancelled = ord?.cancelled ?? 0;
        const earningsOrders = ord?.earningsOrders ?? 0;
        const earningsOffers = led?.offers ?? 0;
        const earningsIncentives = led?.incentives ?? 0;

        rows.push({
          date: day,
          serviceType: svc,
          totalLoginSeconds,
          firstLoginAt,
          lastLogoutAt,
          ordersCompleted,
          ordersCancelled,
          earningsOrders,
          earningsOffers,
          earningsIncentives,
        });
      }
    }

    // Sort by date desc then service
    rows.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.serviceType.localeCompare(b.serviceType);
    });

    const activityRows = rows.filter(
      (r) =>
        r.totalLoginSeconds > 0 ||
        r.firstLoginAt != null ||
        r.lastLogoutAt != null ||
        r.ordersCompleted > 0 ||
        r.ordersCancelled > 0 ||
        r.earningsOrders > 0 ||
        r.earningsOffers > 0 ||
        r.earningsIncentives > 0
    );

    const total = activityRows.length;
    const paginatedRows = activityRows.slice(offset, offset + limit);

    const totals = activityRows.reduce(
      (acc, r) => ({
        loginSeconds: acc.loginSeconds + r.totalLoginSeconds,
        completed: acc.completed + r.ordersCompleted,
        cancelled: acc.cancelled + r.ordersCancelled,
        earningsOrders: acc.earningsOrders + r.earningsOrders,
        earningsOffers: acc.earningsOffers + r.earningsOffers,
        earningsIncentives: acc.earningsIncentives + r.earningsIncentives,
      }),
      {
        loginSeconds: 0,
        completed: 0,
        cancelled: 0,
        earningsOrders: 0,
        earningsOffers: 0,
        earningsIncentives: 0,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        rows: paginatedRows,
        total,
        totals,
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
        period,
        serviceType: serviceFilter,
      },
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/activity-logs] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

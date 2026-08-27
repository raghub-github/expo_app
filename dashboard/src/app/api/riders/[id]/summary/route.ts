/**
 * Rider Summary API Route
 * GET /api/riders/[id]/summary - Get rider summary with recent data
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb, getSql } from "@/lib/db/client";
import { fetchRiderUnifiedTickets } from "@/lib/riders/rider-unified-tickets";
import { fetchRiderRecentOrders, formatRiderOrderDisplayId } from "@/lib/riders/rider-orders-query";
import {
  displayIdFromPenaltyMetadata,
  resolveFormattedOrderIdsByCoreId,
} from "@/lib/riders/resolve-penalty-order-display-ids";
import { walletBlockHistoryReason } from "@/lib/rider-restriction-display";
import {
  riders,
  withdrawalRequests,
  blacklistHistory,
  dutyLogs,
  riderVehicles,
  riderPenalties,
  riderWallet,
  riderWalletFreezeHistory,
  riderNegativeWalletBlocks,
  systemUsers,
  onboardingPayments,
  riderPaymentMethods,
  riderDocuments,
} from "@/lib/db/schema";
import { eq, and, or, desc, gte, lte, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getRedisClient } from "@/lib/redis";
import { getCached, setCached } from "@/lib/server-cache";
import { getRiderLogoutSessionSnapshot } from "@/lib/db/operations/rider-logout-events";
import { getRiderSelfieViewUrl } from "@/lib/rider-selfie-url";
import { resolveOnboardingVehicleDisplayLabel } from "@/lib/rider-onboarding-vehicle-display.server";
import type { RiderLogoutSessionSnapshot } from "@/lib/rider-logout-types";

export const runtime = 'nodejs';

const DEFAULT_LOGOUT_SESSION: RiderLogoutSessionSnapshot = {
  status: "logged_in",
  totalLogoutCount: 0,
  activeDeviceCount: 0,
  latest: null,
};

function withLogoutSessionDefault<T extends { data?: { logoutSession?: RiderLogoutSessionSnapshot } }>(
  payload: T,
): T {
  const data = payload?.data;
  if (!data || data.logoutSession) return payload;
  return {
    ...payload,
    data: {
      ...data,
      logoutSession: DEFAULT_LOGOUT_SESSION,
    },
  };
}

type RiderPenaltyRow = InferSelectModel<typeof riderPenalties>;

interface SummaryQueryParams {
  ordersLimit?: number;
  withdrawalsLimit?: number;
  ticketsLimit?: number;
  penaltiesLimit?: number;
  ordersFrom?: string;
  ordersTo?: string;
  ordersOrderType?: string; // 'all' | 'food' | 'parcel' | 'person_ride'
  ordersStatus?: string; // order status filter
  ordersOrderId?: string; // search by order id
  withdrawalsFrom?: string;
  withdrawalsTo?: string;
  ticketsFrom?: string;
  ticketsTo?: string;
  ticketsStatus?: string; // 'all' | 'open' | 'in_progress' | 'resolved' | 'closed'
  ticketsCategory?: string; // 'all' or category value
  ticketsPriority?: string; // 'all' | 'low' | 'medium' | 'high' | 'urgent'
  penaltiesFrom?: string;
  penaltiesTo?: string;
  penaltiesStatus?: string; // 'all' | 'reverted' | 'not'
  penaltiesServiceType?: string; // 'all' | 'food' | 'parcel' | 'person_ride'
  penaltiesOrderId?: string; // search by order id
}

/**
 * GET /api/riders/[id]/summary
 * Get rider summary with recent orders, withdrawals, tickets, blacklist status, and online status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const email = user.email ?? "";
    const { getSystemUserByEmail } = await import("@/lib/db/operations/users");
    const systemUserForAccess = await getSystemUserByEmail(email);
    if (!systemUserForAccess) {
      return NextResponse.json(
        { success: false, error: "Your account is not set up as an agent. Please contact admin.", code: "AGENT_NOT_FOUND" },
        { status: 403 }
      );
    }
    const userIsSuperAdmin = await isSuperAdmin(user.id, email);
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, email, "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. RIDER dashboard access required.", code: "FORBIDDEN" },
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const params_obj: SummaryQueryParams = {
      ordersLimit: parseInt(searchParams.get('ordersLimit') || '10'),
      withdrawalsLimit: parseInt(searchParams.get('withdrawalsLimit') || '10'),
      ticketsLimit: parseInt(searchParams.get('ticketsLimit') || '10'),
      penaltiesLimit: parseInt(searchParams.get('penaltiesLimit') || '10'),
      ordersFrom: searchParams.get('ordersFrom') || undefined,
      ordersTo: searchParams.get('ordersTo') || undefined,
      ordersOrderType: searchParams.get('ordersOrderType') || undefined,
      ordersStatus: searchParams.get('ordersStatus') || undefined,
      ordersOrderId: searchParams.get('ordersOrderId') || undefined,
      withdrawalsFrom: searchParams.get('withdrawalsFrom') || undefined,
      withdrawalsTo: searchParams.get('withdrawalsTo') || undefined,
      ticketsFrom: searchParams.get('ticketsFrom') || undefined,
      ticketsTo: searchParams.get('ticketsTo') || undefined,
      ticketsStatus: searchParams.get('ticketsStatus') || undefined,
      ticketsCategory: searchParams.get('ticketsCategory') || undefined,
      ticketsPriority: searchParams.get('ticketsPriority') || undefined,
      penaltiesFrom: searchParams.get('penaltiesFrom') || undefined,
      penaltiesTo: searchParams.get('penaltiesTo') || undefined,
      penaltiesStatus: searchParams.get('penaltiesStatus') || undefined,
      penaltiesServiceType: searchParams.get('penaltiesServiceType') || undefined,
      penaltiesOrderId: searchParams.get('penaltiesOrderId') || undefined,
    };

    const db = getDb();
    const redis = getRedisClient();

    // Per‑rider summary cache (30s) – keyed by rider + filters to avoid
    // recalculating heavy aggregates on quick tab switches.
    const cacheKey = riderId ? `rider_summary_v6:${riderId}:${request.nextUrl.searchParams.toString()}` : null;
    const MEMORY_TTL_MS = 10_000; // 10s in-memory fallback

    if (cacheKey) {
      const cached = getCached<unknown>(cacheKey);
      if (cached) {
        return NextResponse.json(withLogoutSessionDefault(cached as { data?: { logoutSession?: RiderLogoutSessionSnapshot } }));
      }
    }

    if (redis && cacheKey) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as unknown;
          const normalized = withLogoutSessionDefault(
            parsed as { data?: { logoutSession?: RiderLogoutSessionSnapshot } },
          );
          setCached(cacheKey, normalized, MEMORY_TTL_MS);
          return NextResponse.json(normalized);
        }
      } catch {
        // ignore cache read errors
      }
    }

    // Get rider basic info
    const [rider] = await db
      .select()
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);

    if (!rider) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 }
      );
    }

    const orderFilters = {
      limit: params_obj.ordersLimit || 10,
      from: params_obj.ordersFrom,
      to: params_obj.ordersTo,
      orderType: params_obj.ordersOrderType,
      status: params_obj.ordersStatus,
      orderId: params_obj.ordersOrderId,
    };

    const withdrawalsConditions: Parameters<typeof and>[0][] = [eq(withdrawalRequests.riderId, riderId)];
    if (params_obj.withdrawalsFrom) {
      withdrawalsConditions.push(gte(withdrawalRequests.createdAt, new Date(params_obj.withdrawalsFrom)));
    }
    if (params_obj.withdrawalsTo) {
      withdrawalsConditions.push(lte(withdrawalRequests.createdAt, new Date(params_obj.withdrawalsTo)));
    }

    const penaltiesConditions: Parameters<typeof and>[0][] = [eq(riderPenalties.riderId, riderId)];
    if (params_obj.penaltiesFrom) {
      penaltiesConditions.push(gte(riderPenalties.imposedAt, new Date(params_obj.penaltiesFrom)));
    }
    if (params_obj.penaltiesTo) {
      penaltiesConditions.push(lte(riderPenalties.imposedAt, new Date(params_obj.penaltiesTo)));
    }
    if (params_obj.penaltiesStatus === "reverted") {
      penaltiesConditions.push(eq(riderPenalties.status, "reversed"));
    } else if (params_obj.penaltiesStatus === "not") {
      penaltiesConditions.push(or(eq(riderPenalties.status, "active"), eq(riderPenalties.status, "paid")));
    }
    if (params_obj.penaltiesServiceType && params_obj.penaltiesServiceType !== "all") {
      if (params_obj.penaltiesServiceType === "unspecified" || params_obj.penaltiesServiceType === "null") {
        penaltiesConditions.push(
          or(
            isNull(riderPenalties.serviceType),
            sql`coalesce((${riderPenalties.metadata}->>'serviceUnspecified')::boolean, false) = true`
          ) as Parameters<typeof and>[0]
        );
      } else {
        penaltiesConditions.push(
          eq(
            riderPenalties.serviceType,
            params_obj.penaltiesServiceType as NonNullable<RiderPenaltyRow["serviceType"]>
          )
        );
      }
    }
    if (params_obj.penaltiesOrderId && params_obj.penaltiesOrderId.trim() !== "") {
      const orderIdNum = parseInt(params_obj.penaltiesOrderId.trim(), 10);
      if (!Number.isNaN(orderIdNum)) {
        penaltiesConditions.push(eq(riderPenalties.orderId, orderIdNum));
      }
    }

    const imposedByUser = alias(systemUsers, "imposed_by_user");
    const reversedByUser = alias(systemUsers, "reversed_by_user");

    const [
      recentOrders,
      recentWithdrawals,
      { tickets: recentTickets },
      activeVehicle,
      blacklistRows,
      penaltyRowsResult,
      selfieUrl,
      negativeWalletBlockRows,
      onboardingRows,
      walletRow,
      latestFreezeRow,
      latestDutyLog,
      logoutSession,
      activeBankAccount,
      subscriptionDuesRow,
    ] = await Promise.all([
      fetchRiderRecentOrders(db, riderId, orderFilters),
      db
        .select()
        .from(withdrawalRequests)
        .where(and(...withdrawalsConditions))
        .orderBy(desc(withdrawalRequests.createdAt))
        .limit(params_obj.withdrawalsLimit || 10),
      fetchRiderUnifiedTickets(riderId, {
        limit: params_obj.ticketsLimit || 10,
        from: params_obj.ticketsFrom,
        to: params_obj.ticketsTo,
        status: params_obj.ticketsStatus,
        category: params_obj.ticketsCategory,
        priority: params_obj.ticketsPriority,
      }),
      db
        .select()
        .from(riderVehicles)
        .where(and(eq(riderVehicles.riderId, riderId), eq(riderVehicles.isActive, true)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          id: blacklistHistory.id,
          riderId: blacklistHistory.riderId,
          serviceType: blacklistHistory.serviceType,
          reason: blacklistHistory.reason,
          banned: blacklistHistory.banned,
          isPermanent: blacklistHistory.isPermanent,
          expiresAt: blacklistHistory.expiresAt,
          adminUserId: blacklistHistory.adminUserId,
          source: blacklistHistory.source,
          createdAt: blacklistHistory.createdAt,
          agentEmailFromJoin: systemUsers.email,
          actorName: systemUsers.fullName,
        })
        .from(blacklistHistory)
        .leftJoin(systemUsers, eq(blacklistHistory.adminUserId, systemUsers.id))
        .where(eq(blacklistHistory.riderId, riderId))
        .orderBy(desc(blacklistHistory.createdAt)),
      db
        .select({
          penalty: riderPenalties,
          imposedByEmail: imposedByUser.email,
          imposedByName: imposedByUser.fullName,
          reversedByEmail: reversedByUser.email,
          reversedByName: reversedByUser.fullName,
        })
        .from(riderPenalties)
        .leftJoin(imposedByUser, eq(riderPenalties.imposedBy, imposedByUser.id))
        .leftJoin(reversedByUser, eq(riderPenalties.reversedBy, reversedByUser.id))
        .where(and(...penaltiesConditions))
        .orderBy(desc(riderPenalties.imposedAt))
        .limit(params_obj.penaltiesLimit ?? 10)
        .catch(() => []),
      getRiderSelfieViewUrl(riderId),
      db
        .select()
        .from(riderNegativeWalletBlocks)
        .where(eq(riderNegativeWalletBlocks.riderId, riderId)),
      db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderId))
        .orderBy(desc(onboardingPayments.createdAt))
        .limit(50)
        .catch(() => []),
      db
        .select()
        .from(riderWallet)
        .where(eq(riderWallet.riderId, riderId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          action: riderWalletFreezeHistory.action,
          reason: riderWalletFreezeHistory.reason,
          createdAt: riderWalletFreezeHistory.createdAt,
          performedByEmail: systemUsers.email,
          performedByName: systemUsers.fullName,
        })
        .from(riderWalletFreezeHistory)
        .leftJoin(systemUsers, eq(riderWalletFreezeHistory.performedBySystemUserId, systemUsers.id))
        .where(eq(riderWalletFreezeHistory.riderId, riderId))
        .orderBy(desc(riderWalletFreezeHistory.createdAt))
        .limit(1)
        .then((rows) => rows[0])
        .catch(() => undefined),
      db
        .select()
        .from(dutyLogs)
        .where(eq(dutyLogs.riderId, riderId))
        .orderBy(desc(dutyLogs.timestamp))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getRiderLogoutSessionSnapshot(riderId),
      db
        .select()
        .from(riderPaymentMethods)
        .where(
          and(
            eq(riderPaymentMethods.riderId, riderId),
            eq(riderPaymentMethods.methodType, "bank"),
            isNull(riderPaymentMethods.deletedAt),
          ),
        )
        .orderBy(desc(riderPaymentMethods.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      (async () => {
        try {
          const sqlClient = getSql();
          const rows = await sqlClient`
            SELECT
              COALESCE(subscription_dues_outstanding, 0)::float8 AS dues_outstanding,
              COALESCE(subscription_dispatch_blocked, FALSE) AS dispatch_blocked,
              COALESCE(subscription_penalty_streak_days, 0)::int AS penalty_streak_days
            FROM riders
            WHERE id = ${riderId}
            LIMIT 1
          `;
          return (rows?.[0] as Record<string, unknown> | undefined) ?? null;
        } catch {
          return null;
        }
      })(),
    ]);

    let recentPenalties: Array<Record<string, unknown>> = [];
    try {
      recentPenalties = (penaltyRowsResult as Array<{
        penalty: typeof riderPenalties.$inferSelect;
        imposedByEmail: string | null;
        imposedByName: string | null;
        reversedByEmail: string | null;
        reversedByName: string | null;
      }>).map((row) => ({
        ...row.penalty,
        imposedByEmail: row.imposedByEmail,
        imposedByName: row.imposedByName,
        reversedByEmail: row.reversedByEmail,
        reversedByName: row.reversedByName,
      }));
      const penaltyOrderIds = recentPenalties
        .map((p) => Number((p as { orderId?: number | null }).orderId))
        .filter((id) => Number.isFinite(id) && id > 0);
      const formattedById = await resolveFormattedOrderIdsByCoreId(db, penaltyOrderIds);
      recentPenalties = recentPenalties.map((p) => {
        const oid = Number((p as { orderId?: number | null }).orderId);
        const fromMeta = displayIdFromPenaltyMetadata(
          (p as { metadata?: unknown }).metadata
        );
        const fromCore =
          Number.isFinite(oid) && oid > 0 ? formattedById.get(oid) ?? null : null;
        const display =
          fromMeta && !/^\d+$/.test(fromMeta)
            ? fromMeta
            : fromCore && !/^\d+$/.test(fromCore)
              ? fromCore
              : fromMeta ?? fromCore;
        return {
          ...p,
          displayOrderId: display,
          formattedOrderId: display,
          orderPublicId: display,
        };
      });
    } catch {
      console.warn("[Summary API] Penalties table not found, skipping penalties data");
    }

    let onboardingFees: { totalPaid: string; transactions: { id: number; amount: string; provider: string; refId: string; status: string; createdAt: string }[] } = { totalPaid: "0", transactions: [] };
    try {
      const completed = onboardingRows.filter((r) => r.status === "completed");
      const totalPaid = completed.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      onboardingFees = {
        totalPaid: totalPaid.toFixed(2),
        transactions: onboardingRows.map((r) => ({
          id: r.id,
          amount: String(r.amount),
          provider: r.provider,
          refId: r.refId,
          status: r.status,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        })),
      };
    } catch {
      // Table may not exist in some envs
    }

    const blacklistEntries = blacklistRows.map((r) => ({
      ...r,
      adminUserId: r.adminUserId,
      actorEmail: r.agentEmailFromJoin ?? null,
    }));

    const now = new Date();
    const isActiveBlacklist = (entry: { banned: boolean; isPermanent: boolean; expiresAt: Date | null }) =>
      entry.banned && (entry.isPermanent || !entry.expiresAt || new Date(entry.expiresAt) > now);

    // Normalize DB service_type (may be FOOD/PARCEL/RIDE/ALL from 0010 or food/parcel/person_ride/all from 0061)
    const normServiceType = (s: string) => {
      const x = (s || '').toLowerCase();
      return x === 'ride' ? 'person_ride' : x;
    };
    // Effective current entry for a slot: most recent among entries matching serviceTypes, then treat as banned only if active
    const getEffectiveForSlot = (serviceTypes: string[]) => {
      const candidate = blacklistEntries.find(e =>
        serviceTypes.includes(normServiceType((e.serviceType as string) || 'all'))
      );
      if (!candidate) return null;
      const active = isActiveBlacklist(candidate);
      const expiresAt = candidate.expiresAt ? new Date(candidate.expiresAt) : null;
      const remainingMs = active && !candidate.isPermanent && expiresAt && expiresAt > now
        ? expiresAt.getTime() - now.getTime()
        : null;
      return {
        ...candidate,
        isBanned: active,
        remainingMs,
      };
    };

    const effectiveAll = getEffectiveForSlot(['all']);
    const effectiveFood = getEffectiveForSlot(['food', 'all']);
    const effectiveParcel = getEffectiveForSlot(['parcel', 'all']);
    const effectivePersonRide = getEffectiveForSlot(['person_ride', 'all']);

    type BlacklistServiceStatus = {
      isBanned: boolean;
      reason: string;
      isPermanent: boolean;
      expiresAt: string | null;
      createdAt: string;
      source: string;
      remainingMs: number | null;
      actorEmail: string | null;
      actorName: string | null;
      /** Present when "all" is adjusted to partially allowed (per-service whitelist) */
      partiallyAllowedServices?: string[];
    };

    const toStatus = (eff: ReturnType<typeof getEffectiveForSlot>): BlacklistServiceStatus | null => {
      if (!eff) return null;
      const row = eff as { source?: string; actorEmail?: string | null; actorName?: string | null };
      return {
        isBanned: eff.isBanned,
        reason: eff.reason,
        isPermanent: eff.isPermanent,
        expiresAt: eff.expiresAt?.toISOString() ?? null,
        createdAt: eff.createdAt.toISOString(),
        source: row.source ?? 'agent',
        remainingMs: eff.remainingMs ?? null,
        actorEmail: row.actorEmail ?? null,
        actorName: row.actorName ?? null,
      };
    };

    // When "All Services" is banned but at least one individual service is whitelisted, show "Partially allowed" so UI is consistent
    const allStatus = toStatus(effectiveAll);
    type AllStatusRow = NonNullable<typeof allStatus> & { partiallyAllowedServices?: string[] };
    let allStatusAdjusted: AllStatusRow | null = allStatus;
    if (allStatus?.isBanned) {
      const foodAllowed = !effectiveFood?.isBanned;
      const parcelAllowed = !effectiveParcel?.isBanned;
      const personRideAllowed = !effectivePersonRide?.isBanned;
      const partiallyAllowedServices: string[] = [];
      if (foodAllowed) partiallyAllowedServices.push('food');
      if (parcelAllowed) partiallyAllowedServices.push('parcel');
      if (personRideAllowed) partiallyAllowedServices.push('person_ride');
      if (partiallyAllowedServices.length > 0) {
        allStatusAdjusted = {
          ...allStatus,
          isBanned: false,
          partiallyAllowedServices,
        };
      }
    }

    const blacklistStatusByService = {
      food: toStatus(effectiveFood),
      parcel: toStatus(effectiveParcel),
      person_ride: toStatus(effectivePersonRide),
      all: allStatusAdjusted,
    };

    // Blacklist/whitelist history (latest first, for UI) + wallet auto-block rows from rider_negative_wallet_blocks
    const walletTotalForBlocks = walletRow ? Number(walletRow.totalBalance ?? 0) : 0;
    const globalWalletBlockForHistory =
      Number.isFinite(walletTotalForBlocks) && walletTotalForBlocks <= -200;

    const blacklistHistoryList = blacklistRows.slice(0, 30).map((r) => ({
      id: r.id,
      serviceType: (r.serviceType as string) || "all",
      banned: r.banned,
      reason: r.reason,
      source: r.source ?? "agent",
      isPermanent: r.isPermanent,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      actorEmail: r.agentEmailFromJoin ?? null,
      actorName: r.actorName ?? null,
      restrictionType: "agent_blacklist" as const,
    }));

    const walletRestrictionHistory = negativeWalletBlockRows.map((b, index) => ({
      id: -(index + 1),
      serviceType: (b.serviceType as string) || "all",
      banned: true,
      reason: walletBlockHistoryReason(
        {
          serviceType: (b.serviceType as string) || "all",
          reason: (b as { reason?: string }).reason ?? "negative_wallet",
          createdAt:
            b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
        },
        globalWalletBlockForHistory
      ),
      source: "automated",
      isPermanent: false,
      expiresAt: null,
      createdAt:
        b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt ?? new Date()),
      actorEmail: null,
      actorName: null,
      restrictionType: "wallet_auto_block" as const,
    }));

    const restrictionHistory = [...blacklistHistoryList, ...walletRestrictionHistory]
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 50);

    // Get online/offline status (most recent duty log)
    // IMPORTANT BUSINESS RULE:
    // Rider can be considered online ONLY if:
    // - Account status is ACTIVE
    // - KYC status is APPROVED
    // - Onboarding stage is ACTIVE
    // AND the latest duty log status is 'ON'.
    const isFullyOnboarded =
      rider.status === "ACTIVE" &&
      rider.kycStatus === "APPROVED" &&
      rider.onboardingStage === "ACTIVE";

    // If no duty log exists, rider is offline (default state).
    // Only consider online if fully onboarded AND there's a duty log with status 'ON'.
    const isOnline =
      isFullyOnboarded && latestDutyLog ? latestDutyLog.status === "ON" : false;

    // Calculate order metrics per service type
    // Note: This uses orders table - for detailed assignment tracking, use order_rider_assignments if available
    const orderMetrics = {
      food: { sent: 0, accepted: 0, completed: 0, rejected: 0 },
      parcel: { sent: 0, accepted: 0, completed: 0, rejected: 0 },
      person_ride: { sent: 0, accepted: 0, completed: 0, rejected: 0 },
    };

    // Count orders by type and status
    recentOrders.forEach(order => {
      const orderType = order.orderType as 'food' | 'parcel' | 'person_ride';
      if (orderMetrics[orderType]) {
        orderMetrics[orderType].sent++;
        if (order.status === 'accepted' || order.status === 'reached_store' || order.status === 'picked_up' || order.status === 'in_transit' || order.status === 'delivered') {
          orderMetrics[orderType].accepted++;
        }
        if (order.status === 'delivered') {
          orderMetrics[orderType].completed++;
        }
        if (order.status === 'cancelled' || order.status === 'failed') {
          orderMetrics[orderType].rejected++;
        }
      }
    });

    const limitationFlags =
      activeVehicle?.limitationFlags &&
      typeof activeVehicle.limitationFlags === "object" &&
      !Array.isArray(activeVehicle.limitationFlags)
        ? (activeVehicle.limitationFlags as Record<string, unknown>)
        : null;
    let onboardingVehicleCode =
      (typeof limitationFlags?.onboardingVehicleTypeCode === "string"
        ? limitationFlags.onboardingVehicleTypeCode
        : null) ||
      (typeof (rider as { vehicleChoice?: string | null }).vehicleChoice === "string"
        ? (rider as { vehicleChoice: string }).vehicleChoice
        : null);

    const isLegacyFuelVehicleChoice = (code: string | null | undefined) => {
      if (!code?.trim()) return true;
      const upper = code.trim().toUpperCase();
      return upper === "EV" || upper === "PETROL";
    };

    if (!onboardingVehicleCode || isLegacyFuelVehicleChoice(onboardingVehicleCode)) {
      const [selectionRow] = await db
        .select({ metadata: riderDocuments.metadata })
        .from(riderDocuments)
        .where(
          and(
            eq(riderDocuments.riderId, riderId),
            eq(riderDocuments.docType, "onboarding_vehicle_selection")
          )
        )
        .limit(1);
      const meta =
        selectionRow?.metadata &&
        typeof selectionRow.metadata === "object" &&
        !Array.isArray(selectionRow.metadata)
          ? (selectionRow.metadata as Record<string, unknown>)
          : null;
      const fromDoc =
        typeof meta?.vehicleChoice === "string" ? meta.vehicleChoice.trim() : null;
      if (fromDoc && !isLegacyFuelVehicleChoice(fromDoc)) {
        onboardingVehicleCode = fromDoc;
      }
    }

    const onboardingVehicle = await resolveOnboardingVehicleDisplayLabel(onboardingVehicleCode);

    const { checkOnboardingPaymentCompleted, isRiderEligibleForApprovalQueue } = await import(
      "@/lib/db/operations/riders"
    );
    const [paymentCompleted, approvalQueueEligible] = await Promise.all([
      checkOnboardingPaymentCompleted(riderId),
      isRiderEligibleForApprovalQueue(riderId),
    ]);

    const payload = {
      success: true,
      data: {
        rider: {
          id: rider.id,
          name: rider.name,
          mobile: rider.mobile,
          countryCode: rider.countryCode,
          city: rider.city,
          state: rider.state,
          pincode: rider.pincode,
          status: rider.status,
          onboardingStage: rider.onboardingStage,
          kycStatus: rider.kycStatus,
          vehicleChoice: (rider as any).vehicleChoice ?? null,
          onboardingVehicleLabel: onboardingVehicle.label,
          selfieUrl: selfieUrl ?? null,
          isOnline,
          lastDutyStatus: latestDutyLog?.status || 'OFF',
          lastDutyTimestamp: latestDutyLog?.timestamp || null,
          // Which services rider turned on for current duty (when online). Empty when offline.
          currentDutyServiceTypes: (() => {
            if (!isOnline || !latestDutyLog?.serviceTypes) return [];
            const raw = latestDutyLog.serviceTypes;
            if (Array.isArray(raw)) return raw as string[];
            if (typeof raw === 'string') {
              try { return JSON.parse(raw) as string[]; } catch { return []; }
            }
            return [];
          })(),
        },
        recentOrders: recentOrders.map((order) => ({
          id: order.id,
          orderType: order.orderType,
          status: order.status,
          riderAssignmentStatus: order.riderAssignmentStatus ?? null,
          riderRideUnassigned: order.riderRideUnassigned ?? false,
          fareAmount: order.fareAmount,
          riderEarning: order.riderEarning,
          walletCredited: order.walletCredited ?? false,
          walletDebited: order.walletDebited ?? false,
          hasLedgerEntry: order.hasLedgerEntry ?? false,
          earningCreditPending: order.earningCreditPending ?? false,
          createdAt:
            order.createdAt instanceof Date
              ? order.createdAt.toISOString()
              : String(order.createdAt),
          formattedOrderId: order.formattedOrderId ?? null,
          orderId: order.orderId ?? null,
          externalRef: order.externalRef ?? null,
          displayOrderId:
            order.displayOrderId?.trim() ||
            formatRiderOrderDisplayId(order),
        })),
        subscriptionDues: (() => {
          const walletBal = walletRow ? Number(walletRow.totalBalance ?? 0) : 0;
          const duesOutstanding = Number(
            (subscriptionDuesRow as { dues_outstanding?: unknown } | null)?.dues_outstanding ?? 0
          );
          const dispatchBlocked = Boolean(
            (subscriptionDuesRow as { dispatch_blocked?: unknown } | null)?.dispatch_blocked
          );
          const penaltyStreakDays = Number(
            (subscriptionDuesRow as { penalty_streak_days?: unknown } | null)?.penalty_streak_days ?? 0
          );
          const totalDue = Math.max(0, duesOutstanding);
          if (totalDue <= 0 && !dispatchBlocked && penaltyStreakDays <= 0) {
            return {
              duesOutstanding: 0,
              totalDue: 0,
              dispatchBlocked: false,
              penaltyStreakDays: 0,
              walletBalance: Number.isFinite(walletBal) ? walletBal : 0,
            };
          }
          return {
            duesOutstanding: Number.isFinite(duesOutstanding) ? duesOutstanding : 0,
            totalDue,
            dispatchBlocked,
            penaltyStreakDays: Number.isFinite(penaltyStreakDays) ? penaltyStreakDays : 0,
            walletBalance: Number.isFinite(walletBal) ? walletBal : 0,
          };
        })(),
        recentWithdrawals: recentWithdrawals.map(withdrawal => ({
          id: withdrawal.id,
          amount: withdrawal.amount,
          status: withdrawal.status,
          bankAcc: withdrawal.bankAcc,
          createdAt: withdrawal.createdAt,
          processedAt: withdrawal.processedAt,
          failureReason: withdrawal.failureReason ?? null,
        })),
        recentTickets,
        vehicle: activeVehicle ? {
          id: activeVehicle.id,
          vehicleType: activeVehicle.vehicleType,
          onboardingVehicleCode: onboardingVehicle.code,
          onboardingVehicleLabel: onboardingVehicle.label,
          registrationNumber: activeVehicle.registrationNumber,
          make: activeVehicle.make,
          model: activeVehicle.model,
          fuelType: activeVehicle.fuelType,
          vehicleCategory: activeVehicle.vehicleCategory,
          acType: activeVehicle.acType,
          serviceTypes: activeVehicle.serviceTypes || [],
          verified: activeVehicle.verified,
        } : null,
        bankAccount: activeBankAccount
          ? {
              id: activeBankAccount.id,
              accountHolderName: activeBankAccount.accountHolderName,
              bankName: activeBankAccount.bankName ?? null,
              ifsc: activeBankAccount.ifsc ?? null,
              branch: activeBankAccount.branch ?? null,
              accountNumberMasked: activeBankAccount.accountNumberEncrypted ? "••••" : null,
              verificationStatus: activeBankAccount.verificationStatus,
              verifiedAt: activeBankAccount.verifiedAt
                ? activeBankAccount.verifiedAt.toISOString()
                : null,
              createdAt: activeBankAccount.createdAt.toISOString(),
            }
          : null,
        blacklistStatusByService,
        blacklistHistory: restrictionHistory,
        restrictionHistory,
        negativeWalletBlocks: negativeWalletBlockRows.map((b) => ({
          serviceType: b.serviceType,
          reason: b.reason,
          blockReason: (b as { reason?: string }).reason === "global_emergency" ? "global" as const : "service" as const,
          createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
        })),
        recentPenalties: recentPenalties.map(penalty => ({
          id: penalty.id,
          orderId: penalty.orderId ?? null,
          displayOrderId: (penalty as { displayOrderId?: string | null }).displayOrderId ?? null,
          formattedOrderId: (penalty as { formattedOrderId?: string | null }).formattedOrderId ?? null,
          orderPublicId: (penalty as { orderPublicId?: string | null }).orderPublicId ?? null,
          serviceType: penalty.serviceType,
          penaltyType: penalty.penaltyType,
          amount: penalty.amount,
          reason: penalty.reason,
          status: penalty.status,
          imposedAt: penalty.imposedAt,
          resolvedAt: penalty.resolvedAt,
          imposedByEmail: (penalty as { imposedByEmail?: string | null }).imposedByEmail ?? null,
          imposedByName: (penalty as { imposedByName?: string | null }).imposedByName ?? null,
          reversedByEmail: (penalty as { reversedByEmail?: string | null }).reversedByEmail ?? null,
          reversedByName: (penalty as { reversedByName?: string | null }).reversedByName ?? null,
        })),
        wallet: walletRow ? (() => {
          const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
          const total = toNum(walletRow.totalBalance);
          const globalWalletBlock = total <= -200;
          // Never show negative withdrawable — cash-out is 0 when wallet is in debt.
          const rawWithdrawable = toNum((walletRow as { withdrawable?: unknown }).withdrawable ?? walletRow.totalBalance);
          const withdrawable = Math.max(0, Math.min(rawWithdrawable, total));
          const locked = toNum((walletRow as { locked?: unknown }).locked ?? 0);
          const security = toNum((walletRow as { securityBalance?: unknown }).securityBalance ?? 0);
          const isFrozen = Boolean((walletRow as { isFrozen?: boolean }).isFrozen);
          const frozenAt = (walletRow as { frozenAt?: Date | null }).frozenAt ?? null;
          const freezeReason = isFrozen
            ? ((walletRow as { freezeReason?: string | null }).freezeReason
                ?? latestFreezeRow?.reason
                ?? null)
            : null;
          return {
          totalBalance: String(total),
          globalWalletBlock,
          withdrawable: String(withdrawable),
          locked: String(locked),
          securityBalance: String(security),
          earningsFood: walletRow.earningsFood,
          earningsParcel: walletRow.earningsParcel,
          earningsPersonRide: walletRow.earningsPersonRide,
          penaltiesFood: walletRow.penaltiesFood,
          penaltiesParcel: walletRow.penaltiesParcel,
          penaltiesPersonRide: walletRow.penaltiesPersonRide,
          totalWithdrawn: walletRow.totalWithdrawn,
          lastUpdatedAt: walletRow.lastUpdatedAt,
          isFrozen,
          freezeReason,
          frozenAt: frozenAt ? String(frozenAt) : null,
          latestFreezeAction: latestFreezeRow ? {
            action: latestFreezeRow.action,
            reason: latestFreezeRow.reason ?? null,
            createdAt: latestFreezeRow.createdAt instanceof Date ? latestFreezeRow.createdAt.toISOString() : String(latestFreezeRow.createdAt),
            performedByEmail: latestFreezeRow.performedByEmail ?? null,
            performedByName: latestFreezeRow.performedByName ?? null,
          } : null,
          };
        })() : null,
        orderMetrics,
        onboardingFees,
        paymentCompleted,
        approvalQueueEligible,
        logoutSession: logoutSession ?? DEFAULT_LOGOUT_SESSION,
      },
    } as const;

    if (cacheKey) {
      setCached(cacheKey, payload, MEMORY_TTL_MS);
    }

    if (redis && cacheKey) {
      try {
        await redis.set(cacheKey, JSON.stringify(payload), "EX", 30);
      } catch {
        // ignore cache write errors
      }
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[GET /api/riders/[id]/summary] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

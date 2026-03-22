/**
 * Rider Summary API Route
 * GET /api/riders/[id]/summary - Get rider summary with recent data
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, orders, ordersCore, withdrawalRequests, tickets, blacklistHistory, dutyLogs, riderVehicles, riderPenalties, riderWallet, riderWalletFreezeHistory, riderNegativeWalletBlocks, riderDocuments, systemUsers, onboardingPayments } from "@/lib/db/schema";
import { eq, and, or, desc, gte, lte, isNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getRedisClient } from "@/lib/redis";
import { getCached, setCached } from "@/lib/server-cache";

export const runtime = 'nodejs';

/** Query params are strings; Drizzle enum columns need the schema literal union */
type OrdersCoreRow = InferSelectModel<typeof ordersCore>;
type OrdersLegacyRow = InferSelectModel<typeof orders>;
type TicketRow = InferSelectModel<typeof tickets>;
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
    const cacheKey = riderId ? `rider_summary:${riderId}:${request.nextUrl.searchParams.toString()}` : null;
    const MEMORY_TTL_MS = 10_000; // 10s in-memory fallback

    if (cacheKey) {
      const cached = getCached<unknown>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    if (redis && cacheKey) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as unknown;
          setCached(cacheKey, parsed, MEMORY_TTL_MS);
          return NextResponse.json(parsed);
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

    // Get recent orders (from orders table; use orders_core only when env USE_ORDERS_CORE=true)
    const useOrdersCore = process.env.USE_ORDERS_CORE === "true";
    let recentOrders: Array<Record<string, unknown>>;
    if (useOrdersCore) {
      try {
        const ordersConditions: any[] = [eq(ordersCore.riderId, riderId)];
        if (params_obj.ordersFrom) {
          ordersConditions.push(gte(ordersCore.createdAt, new Date(params_obj.ordersFrom)));
        }
        if (params_obj.ordersTo) {
          ordersConditions.push(lte(ordersCore.createdAt, new Date(params_obj.ordersTo)));
        }
        if (params_obj.ordersOrderType && params_obj.ordersOrderType !== "all") {
          ordersConditions.push(
            eq(ordersCore.orderType, params_obj.ordersOrderType as OrdersCoreRow["orderType"])
          );
        }
        if (params_obj.ordersStatus && params_obj.ordersStatus !== "all") {
          ordersConditions.push(
            eq(ordersCore.status, params_obj.ordersStatus as (typeof ordersCore.$inferSelect)["status"])          );
        }
        if (params_obj.ordersOrderId && params_obj.ordersOrderId.trim() !== "") {
          const orderIdNum = parseInt(params_obj.ordersOrderId.trim(), 10);
          if (!Number.isNaN(orderIdNum)) {
            ordersConditions.push(eq(ordersCore.id, orderIdNum));
          }
        }
        const rows = await db
          .select()
          .from(ordersCore)
          .where(ordersConditions.length > 1 ? and(...ordersConditions) : ordersConditions[0])
          .orderBy(desc(ordersCore.createdAt))
          .limit(params_obj.ordersLimit || 10);
        recentOrders = rows.map((row) => {
          const r = row as unknown as {
            pickupAddressRaw?: string;
            dropAddressRaw?: string;
            pickupLat?: number;
            pickupLon?: number;
            dropLat?: number;
            dropLon?: number;
            distanceKm?: number;
            updatedAt?: Date;
          };
          return {
            id: row.id,
            orderType: row.orderType,
            riderId: row.riderId,
            customerId: row.customerId,
            pickupAddress: r.pickupAddressRaw,
            dropAddress: r.dropAddressRaw,
            pickupLat: r.pickupLat,
            pickupLon: r.pickupLon,
            dropLat: r.dropLat,
            dropLon: r.dropLon,
            distanceKm: r.distanceKm,
            fareAmount: row.fareAmount,
            riderEarning: row.riderEarning,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: r.updatedAt,
          };
        });      } catch {
        // Fallback to orders table if orders_core fails (e.g. table missing)
        const ordersConditions: any[] = [eq(orders.riderId, riderId)];
        if (params_obj.ordersFrom) {
          ordersConditions.push(gte(orders.createdAt, new Date(params_obj.ordersFrom)));
        }
        if (params_obj.ordersTo) {
          ordersConditions.push(lte(orders.createdAt, new Date(params_obj.ordersTo)));
        }
        if (params_obj.ordersOrderType && params_obj.ordersOrderType !== "all") {
          ordersConditions.push(
            eq(orders.orderType, params_obj.ordersOrderType as OrdersLegacyRow["orderType"])
          );
        }
        if (params_obj.ordersStatus && params_obj.ordersStatus !== "all") {
          ordersConditions.push(
            eq(orders.status, params_obj.ordersStatus as (typeof orders.$inferSelect)["status"])          );
        }
        if (params_obj.ordersOrderId && params_obj.ordersOrderId.trim() !== "") {
          const orderIdNum = parseInt(params_obj.ordersOrderId.trim(), 10);
          if (!Number.isNaN(orderIdNum)) {
            ordersConditions.push(eq(orders.id, orderIdNum));
          }
        }
        recentOrders = await db
          .select()
          .from(orders)
          .where(ordersConditions.length > 1 ? and(...ordersConditions) : ordersConditions[0])
          .orderBy(desc(orders.createdAt))
          .limit(params_obj.ordersLimit || 10);
      }
    } else {
      const ordersConditions: any[] = [eq(orders.riderId, riderId)];
      if (params_obj.ordersFrom) {
        ordersConditions.push(gte(orders.createdAt, new Date(params_obj.ordersFrom)));
      }
      if (params_obj.ordersTo) {
        ordersConditions.push(lte(orders.createdAt, new Date(params_obj.ordersTo)));
      }
      if (params_obj.ordersOrderType && params_obj.ordersOrderType !== "all") {
        ordersConditions.push(
          eq(orders.orderType, params_obj.ordersOrderType as OrdersLegacyRow["orderType"])
        );
      }
      if (params_obj.ordersStatus && params_obj.ordersStatus !== "all") {
        ordersConditions.push(
          eq(orders.status, params_obj.ordersStatus as (typeof orders.$inferSelect)["status"])        );
      }
      if (params_obj.ordersOrderId && params_obj.ordersOrderId.trim() !== "") {
        const orderIdNum = parseInt(params_obj.ordersOrderId.trim(), 10);
        if (!Number.isNaN(orderIdNum)) {
          ordersConditions.push(eq(orders.id, orderIdNum));
        }
      }
      recentOrders = await db
        .select()
        .from(orders)
        .where(ordersConditions.length > 1 ? and(...ordersConditions) : ordersConditions[0])
        .orderBy(desc(orders.createdAt))
        .limit(params_obj.ordersLimit || 10);
    }

    // Get recent withdrawals
    const withdrawalsConditions: any[] = [eq(withdrawalRequests.riderId, riderId)];
    if (params_obj.withdrawalsFrom) {
      withdrawalsConditions.push(gte(withdrawalRequests.createdAt, new Date(params_obj.withdrawalsFrom)));
    }
    if (params_obj.withdrawalsTo) {
      withdrawalsConditions.push(lte(withdrawalRequests.createdAt, new Date(params_obj.withdrawalsTo)));
    }

    const recentWithdrawals = await db
      .select()
      .from(withdrawalRequests)
      .where(withdrawalsConditions.length > 1 ? and(...withdrawalsConditions) : withdrawalsConditions[0])
      .orderBy(desc(withdrawalRequests.createdAt))
      .limit(params_obj.withdrawalsLimit || 10);

    // Get recent tickets
    const ticketsConditions: any[] = [eq(tickets.riderId, riderId)];
    if (params_obj.ticketsFrom) {
      ticketsConditions.push(gte(tickets.createdAt, new Date(params_obj.ticketsFrom)));
    }
    if (params_obj.ticketsTo) {
      ticketsConditions.push(lte(tickets.createdAt, new Date(params_obj.ticketsTo)));
    }
    if (params_obj.ticketsStatus && params_obj.ticketsStatus !== "all") {
      ticketsConditions.push(
        eq(tickets.status, params_obj.ticketsStatus as TicketRow["status"])
      );
    }
    if (params_obj.ticketsCategory && params_obj.ticketsCategory !== "all") {
      ticketsConditions.push(eq(tickets.category, params_obj.ticketsCategory));
    }
    if (params_obj.ticketsPriority && params_obj.ticketsPriority !== "all") {
      ticketsConditions.push(eq(tickets.priority, params_obj.ticketsPriority));
    }

    // Explicit select so this works even if migration 0080 (resolved_by) has not been run
    const recentTickets = await db
      .select({
        id: tickets.id,
        riderId: tickets.riderId,
        orderId: tickets.orderId,
        category: tickets.category,
        priority: tickets.priority,
        subject: tickets.subject,
        message: tickets.message,
        status: tickets.status,
        resolution: tickets.resolution,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        resolvedAt: tickets.resolvedAt,
      })
      .from(tickets)
      .where(ticketsConditions.length > 1 ? and(...ticketsConditions) : ticketsConditions[0])
      .orderBy(desc(tickets.createdAt))
      .limit(params_obj.ticketsLimit || 10);

    // Get vehicle information (active vehicle)
    const [activeVehicle] = await db
      .select()
      .from(riderVehicles)
      .where(and(eq(riderVehicles.riderId, riderId), eq(riderVehicles.isActive, true)))
      .limit(1);

    // Get all blacklist history for rider with agent email/name (ordered by created_at DESC)
    // Note: Do not select blacklistHistory.actorEmail here — column may not exist until migration 0070 is run.
    // Agent email comes from the join (system_users.email) when admin_user_id is set.
    const blacklistRows = await db
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
      .orderBy(desc(blacklistHistory.createdAt));
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

    // Blacklist/whitelist history (latest first, for UI)
    const blacklistHistoryList = blacklistRows.slice(0, 30).map((r) => ({
      id: r.id,
      serviceType: (r.serviceType as string) || 'all',
      banned: r.banned,
      reason: r.reason,
      source: r.source ?? 'agent',
      isPermanent: r.isPermanent,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      actorEmail: r.agentEmailFromJoin ?? null,
      actorName: r.actorName ?? null,
    }));

    // Get recent penalties (if table exists) with imposed/reverted by agent
    let recentPenalties: any[] = [];
    try {
      const penaltiesConditions: any[] = [eq(riderPenalties.riderId, riderId)];
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
          penaltiesConditions.push(isNull(riderPenalties.serviceType));
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
      const penaltyRows = await db
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
        .where(penaltiesConditions.length > 1 ? and(...penaltiesConditions) : penaltiesConditions[0])
        .orderBy(desc(riderPenalties.imposedAt))
        .limit(params_obj.penaltiesLimit ?? 10);
      recentPenalties = penaltyRows.map((row) => ({ ...row.penalty, imposedByEmail: row.imposedByEmail, imposedByName: row.imposedByName, reversedByEmail: row.reversedByEmail, reversedByName: row.reversedByName }));
    } catch (error) {
      // Table might not exist yet - ignore error
      console.warn("[Summary API] Penalties table not found, skipping penalties data");
    }

    // Rider selfie: from riders.selfieUrl or latest rider_documents (docType = 'selfie')
    let selfieUrl: string | null = (rider as { selfieUrl?: string | null }).selfieUrl ?? null;
    if (!selfieUrl) {
      const [selfieDoc] = await db
        .select({ fileUrl: riderDocuments.fileUrl })
        .from(riderDocuments)
        .where(and(eq(riderDocuments.riderId, riderId), eq(riderDocuments.docType, "selfie")))
        .orderBy(desc(riderDocuments.createdAt))
        .limit(1);
      if (selfieDoc?.fileUrl) selfieUrl = selfieDoc.fileUrl;
    }

    // Negative wallet blocks (temporary per-service block when balance <= -50)
    const negativeWalletBlockRows = await db
      .select()
      .from(riderNegativeWalletBlocks)
      .where(eq(riderNegativeWalletBlocks.riderId, riderId));

    // Onboarding payments (registration fees) – for display when rider not yet verified (home) and in wallet/full details
    let onboardingFees: { totalPaid: string; transactions: { id: number; amount: string; provider: string; refId: string; status: string; createdAt: string }[] } = { totalPaid: "0", transactions: [] };
    try {
      const onboardingRows = await db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderId))
        .orderBy(desc(onboardingPayments.createdAt))
        .limit(50);
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

    // Wallet (rider_wallet) – total balance, earnings, penalties, total_withdrawn
    const [walletRow] = await db
      .select()
      .from(riderWallet)
      .where(eq(riderWallet.riderId, riderId))
      .limit(1);

    // Latest wallet freeze/unfreeze action (for display) – optional table
    let latestFreezeRow: { action: string; reason: string | null; createdAt: Date; performedByEmail: string | null; performedByName: string | null } | undefined;
    try {
      [latestFreezeRow] = await db
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
        .limit(1);
    } catch {
      latestFreezeRow = undefined;
    }

    // Get online/offline status (most recent duty log)
    // IMPORTANT BUSINESS RULE:
    // Rider can be considered online ONLY if:
    // - Account status is ACTIVE
    // - KYC status is APPROVED
    // - Onboarding stage is ACTIVE
    // AND the latest duty log status is 'ON'.
    const [latestDutyLog] = await db
      .select()
      .from(dutyLogs)
      .where(eq(dutyLogs.riderId, riderId))
      .orderBy(desc(dutyLogs.timestamp))
      .limit(1);

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
          vehicleChoice: (rider as any).vehicleChoice ?? null, // 'EV' or 'Petrol' from rider profile
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
        recentOrders: recentOrders.map(order => ({
          id: order.id,
          orderType: order.orderType,
          status: order.status,
          fareAmount: order.fareAmount,
          riderEarning: order.riderEarning,
          createdAt: order.createdAt,
        })),
        recentWithdrawals: recentWithdrawals.map(withdrawal => ({
          id: withdrawal.id,
          amount: withdrawal.amount,
          status: withdrawal.status,
          bankAcc: withdrawal.bankAcc,
          createdAt: withdrawal.createdAt,
          processedAt: withdrawal.processedAt,
        })),
        recentTickets: recentTickets.map(ticket => ({
          id: ticket.id,
          orderId: ticket.orderId ?? undefined,
          category: ticket.category,
          priority: ticket.priority,
          subject: ticket.subject,
          message: ticket.message,
          status: ticket.status,
          createdAt: ticket.createdAt,
          resolvedAt: ticket.resolvedAt,
        })),
        vehicle: activeVehicle ? {
          id: activeVehicle.id,
          vehicleType: activeVehicle.vehicleType,
          registrationNumber: activeVehicle.registrationNumber,
          make: activeVehicle.make,
          model: activeVehicle.model,
          fuelType: activeVehicle.fuelType,
          vehicleCategory: activeVehicle.vehicleCategory,
          acType: activeVehicle.acType,
          serviceTypes: activeVehicle.serviceTypes || [],
          verified: activeVehicle.verified,
        } : null,
        blacklistStatusByService,
        blacklistHistory: blacklistHistoryList,
        negativeWalletBlocks: negativeWalletBlockRows.map((b) => ({
          serviceType: b.serviceType,
          reason: b.reason,
          blockReason: (b as { reason?: string }).reason === "global_emergency" ? "global" as const : "service" as const,
          createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
        })),
        recentPenalties: recentPenalties.map(penalty => ({
          id: penalty.id,
          orderId: penalty.orderId ?? null,
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
          const withdrawable = toNum((walletRow as { withdrawable?: unknown }).withdrawable ?? walletRow.totalBalance);
          const locked = toNum((walletRow as { locked?: unknown }).locked ?? 0);
          const security = toNum((walletRow as { securityBalance?: unknown }).securityBalance ?? 0);
          const isFrozen = Boolean((walletRow as { isFrozen?: boolean }).isFrozen);
          const frozenAt = (walletRow as { frozenAt?: Date | null }).frozenAt ?? null;
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

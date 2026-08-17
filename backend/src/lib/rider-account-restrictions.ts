/**
 * Rider account restriction snapshot — mirrors riders dashboard block logic.
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import {
  blacklistHistory,
  dutyLogs,
  riderNegativeWalletBlocks,
  riderPenalties,
  riderWallet,
  riders,
} from "../db/schema.js";
import { recordRiderDutyLog } from "./rider-duty-log.service.js";
import {
  GLOBAL_BLOCK_THRESHOLD,
  NEGATIVE_WALLET_THRESHOLD,
} from "./rider-negative-wallet-blocks.js";
import { splitWalletNegativeBalance } from "./rider-wallet-balance-split.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type RiderAccountRestrictions = {
  accountRestricted: boolean;
  accountRestrictedReason:
    | "none"
    | "service_blacklist"
    | "all_services_blacklist"
    | "blocked_status";
  globalWalletBlock: boolean;
  negativeWalletBlocks: Array<{ serviceType: string; reason: string }>;
  blacklistBlockedServices: string[];
  allServicesBlacklisted: boolean;
  penaltyDue: number;
  penaltyDutyStopped: boolean;
};

function normServiceType(s: string): string {
  const x = (s || "").toLowerCase().trim();
  if (x === "ride" || x === "person_ride") return "person_ride";
  if (x === "food" || x === "parcel" || x === "all") return x;
  return x;
}

export function normalizeBlockedServiceList(
  services: string[] | null | undefined
): Array<"food" | "parcel" | "person_ride"> {
  const out = new Set<"food" | "parcel" | "person_ride">();
  for (const raw of services ?? []) {
    const norm = normServiceType(raw);
    if (norm === "food" || norm === "parcel" || norm === "person_ride") {
      out.add(norm);
    }
  }
  return [...out];
}

async function readActiveBlacklist(riderId: number) {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select()
    .from(blacklistHistory)
    .where(eq(blacklistHistory.riderId, riderId))
    .orderBy(desc(blacklistHistory.createdAt));

  const isActiveBan = (entry: {
    banned: boolean;
    isPermanent: boolean;
    expiresAt: Date | null;
  }) =>
    entry.banned &&
    (entry.isPermanent || !entry.expiresAt || new Date(entry.expiresAt) > now);

  const getEffectiveForSlot = (serviceTypes: string[]) => {
    const candidate = rows.find((e) =>
      serviceTypes.includes(normServiceType((e.serviceType as string) || "all"))
    );
    if (!candidate) return null;
    const active = isActiveBan(candidate);
    return {
      ...candidate,
      isBanned: active,
    };
  };

  const effectiveAll = getEffectiveForSlot(["all"]);
  const effectiveFood = getEffectiveForSlot(["food", "all"]);
  const effectiveParcel = getEffectiveForSlot(["parcel", "all"]);
  const effectivePersonRide = getEffectiveForSlot(["person_ride", "all"]);

  const foodBanned = effectiveFood?.isBanned ?? false;
  const parcelBanned = effectiveParcel?.isBanned ?? false;
  const personRideBanned = effectivePersonRide?.isBanned ?? false;

  const blockedServices: string[] = [];
  if (foodBanned) blockedServices.push("food");
  if (parcelBanned) blockedServices.push("parcel");
  if (personRideBanned) blockedServices.push("person_ride");

  return {
    allBanned: effectiveAll?.isBanned ?? false,
    foodBanned,
    parcelBanned,
    personRideBanned,
    blockedServices,
    allServicesBlacklisted: foodBanned && parcelBanned && personRideBanned,
  };
}

async function readSubscriptionDuesOutstanding(riderId: number): Promise<number> {
  const pg = getSql();
  try {
    const rows = await pg`
      SELECT COALESCE(subscription_dues_outstanding, 0) AS dues
      FROM riders
      WHERE id = ${riderId}
      LIMIT 1
    `;
    return round2(Number((rows[0] as { dues?: unknown })?.dues ?? 0));
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    return 0;
  }
}

async function readActivePenaltyTotal(riderId: number): Promise<number> {
  const db = getDb();
  try {
    const [row] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${riderPenalties.amount}::numeric), 0)`,
      })
      .from(riderPenalties)
      .where(
        and(
          eq(riderPenalties.riderId, riderId),
          or(eq(riderPenalties.status, "active"), eq(riderPenalties.status, "applied"))
        )
      );
    return round2(Number(row?.total ?? 0));
  } catch {
    return 0;
  }
}

function walletPenaltiesColumnSum(
  wallet: { penaltiesFood?: string | number | null; penaltiesParcel?: string | number | null; penaltiesPersonRide?: string | number | null } | null | undefined
): number {
  if (!wallet) return 0;
  const n = (v: string | number | null | undefined) => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) ? x : 0;
  };
  return round2(n(wallet.penaltiesFood) + n(wallet.penaltiesParcel) + n(wallet.penaltiesPersonRide));
}

function resolvePenaltyDue(input: {
  totalBalance: number;
  splitPenaltyNegative: number;
  splitSubscriptionNegative: number;
  activePenaltyTotal: number;
  walletPenaltiesSum: number;
  hasServicePenaltyBlocks: boolean;
  blockedServiceCount: number;
}): number {
  const {
    totalBalance,
    splitPenaltyNegative,
    splitSubscriptionNegative,
    activePenaltyTotal,
    walletPenaltiesSum,
    hasServicePenaltyBlocks,
    blockedServiceCount,
  } = input;

  let penaltyDue = splitPenaltyNegative;

  if (penaltyDue <= 0 && activePenaltyTotal > 0) {
    penaltyDue = activePenaltyTotal;
  }

  if (penaltyDue <= 0 && walletPenaltiesSum > 0) {
    penaltyDue =
      totalBalance < 0
        ? round2(Math.min(walletPenaltiesSum, -totalBalance - splitSubscriptionNegative))
        : walletPenaltiesSum;
  }

  if (penaltyDue <= 0 && totalBalance < 0 && splitSubscriptionNegative <= 0 && activePenaltyTotal <= 0) {
    penaltyDue = 0;
  }

  if (penaltyDue <= 0 && totalBalance < 0 && activePenaltyTotal > 0) {
    penaltyDue = round2(
      Math.min(activePenaltyTotal, Math.max(0, -totalBalance - splitSubscriptionNegative))
    );
  }

  if (penaltyDue <= 0 && hasServicePenaltyBlocks && blockedServiceCount > 0) {
    penaltyDue = round2(blockedServiceCount * NEGATIVE_WALLET_THRESHOLD);
  }

  return round2(Math.max(0, penaltyDue));
}

function resolveWalletBlockedServices(input: {
  globalWalletBlock: boolean;
  hasGlobalEmergencyBlock: boolean;
  negativeWalletBlocks: Array<{ serviceType: string; reason: string }>;
}): Array<"food" | "parcel" | "person_ride"> {
  const { globalWalletBlock, hasGlobalEmergencyBlock, negativeWalletBlocks } = input;

  if (globalWalletBlock || hasGlobalEmergencyBlock) {
    return ["food", "parcel", "person_ride"];
  }

  return normalizeBlockedServiceList(
    negativeWalletBlocks
      .filter((b) => b.reason === "negative_wallet" || b.reason === "global_emergency")
      .map((b) => b.serviceType)
  );
}

function mergeBlockedServices(
  ...lists: Array<Array<string | null | undefined> | null | undefined>
): Array<"food" | "parcel" | "person_ride"> {
  const flat: string[] = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      if (item != null && item !== "") flat.push(item);
    }
  }
  return normalizeBlockedServiceList(flat);
}

export async function getRiderAccountRestrictions(
  riderId: number
): Promise<RiderAccountRestrictions> {
  const db = getDb();

  const [[rider], [wallet], blockRows, blacklist, subscriptionDuesOutstanding, activePenaltyTotal] =
    await Promise.all([
      db.select({ status: riders.status }).from(riders).where(eq(riders.id, riderId)).limit(1),
      db.select().from(riderWallet).where(eq(riderWallet.riderId, riderId)).limit(1),
      db
        .select({
          serviceType: riderNegativeWalletBlocks.serviceType,
          reason: riderNegativeWalletBlocks.reason,
        })
        .from(riderNegativeWalletBlocks)
        .where(eq(riderNegativeWalletBlocks.riderId, riderId)),
      readActiveBlacklist(riderId),
      readSubscriptionDuesOutstanding(riderId),
      readActivePenaltyTotal(riderId),
    ]);

  const totalBalance = round2(Number(wallet?.totalBalance ?? 0));
  const walletPenaltiesSum = walletPenaltiesColumnSum(wallet ?? null);
  const split = splitWalletNegativeBalance(totalBalance, wallet ?? null, {
    subscriptionDuesOutstanding,
    activePenaltyTotal,
  });
  const globalWalletBlock = totalBalance <= GLOBAL_BLOCK_THRESHOLD;
  const negativeWalletBlocks = blockRows.map((row: { serviceType: string; reason: string }) => ({
    serviceType: row.serviceType,
    reason: row.reason,
  }));

  const riderStatus = rider?.status ?? "INACTIVE";
  const blockedStatus = riderStatus === "BLOCKED" || riderStatus === "BANNED";

  const hasGlobalEmergencyBlock = negativeWalletBlocks.some(
    (b: { reason: string }) => b.reason === "global_emergency"
  );
  const servicePenaltyBlocks = negativeWalletBlocks.filter(
    (b: { reason: string }) => b.reason === "negative_wallet"
  );
  const hasServicePenaltyBlocks =
    servicePenaltyBlocks.length > 0 || hasGlobalEmergencyBlock;

  const walletBlockedServices = resolveWalletBlockedServices({
    globalWalletBlock,
    hasGlobalEmergencyBlock,
    negativeWalletBlocks,
  });

  let accountRestrictedReason: RiderAccountRestrictions["accountRestrictedReason"] = "none";
  let blacklistBlockedServices = mergeBlockedServices(
    blacklist.blockedServices,
    walletBlockedServices
  );
  let allServicesBlacklisted =
    blacklistBlockedServices.length >= 3 ||
    globalWalletBlock ||
    hasGlobalEmergencyBlock ||
    blacklist.allServicesBlacklisted;

  if (blockedStatus) {
    accountRestrictedReason = "all_services_blacklist";
    blacklistBlockedServices = ["food", "parcel", "person_ride"];
    allServicesBlacklisted = true;
  } else if (globalWalletBlock || hasGlobalEmergencyBlock) {
    accountRestrictedReason = "all_services_blacklist";
    blacklistBlockedServices = ["food", "parcel", "person_ride"];
    allServicesBlacklisted = true;
  } else if (blacklistBlockedServices.length > 0) {
    accountRestrictedReason = allServicesBlacklisted
      ? "all_services_blacklist"
      : "service_blacklist";
  }

  const accountRestricted = blockedStatus || blacklistBlockedServices.length > 0;

  const penaltyDue = resolvePenaltyDue({
    totalBalance,
    splitPenaltyNegative: split.penaltyNegative,
    splitSubscriptionNegative: split.subscriptionNegative,
    activePenaltyTotal,
    walletPenaltiesSum,
    hasServicePenaltyBlocks,
    blockedServiceCount: Math.max(servicePenaltyBlocks.length, hasGlobalEmergencyBlock ? 1 : 0),
  });

  // Positive wallet: penalties absorb from earnings — no pay banner / duty stop for penalty.
  const payablePenaltyDue = totalBalance < 0 ? penaltyDue : 0;

  const penaltyDutyStopped =
    !blockedStatus &&
    !accountRestricted &&
    totalBalance < 0 &&
    split.penaltyNegative > 0 &&
    (payablePenaltyDue > 0 || hasServicePenaltyBlocks);

  return {
    accountRestricted,
    accountRestrictedReason,
    globalWalletBlock,
    negativeWalletBlocks,
    blacklistBlockedServices,
    allServicesBlacklisted,
    penaltyDue: payablePenaltyDue,
    penaltyDutyStopped,
  };
}

export type RiderDispatchService = "food" | "parcel" | "person_ride";

/** Agent blacklist + wallet auto-block + BLOCKED/BANNED status (dashboard parity). */
export async function getRiderDispatchBlockSnapshot(riderId: number): Promise<{
  accountRestricted: boolean;
  allServicesBlocked: boolean;
  blockedServices: RiderDispatchService[];
  penaltyDutyStopped: boolean;
}> {
  const restrictions = await getRiderAccountRestrictions(riderId);
  return {
    accountRestricted: restrictions.accountRestricted,
    allServicesBlocked: restrictions.allServicesBlacklisted,
    blockedServices: restrictions.blacklistBlockedServices.filter(
      (s): s is RiderDispatchService =>
        s === "food" || s === "parcel" || s === "person_ride"
    ),
    penaltyDutyStopped: restrictions.penaltyDutyStopped,
  };
}

export function isDispatchServiceBlocked(
  serviceType: RiderDispatchService,
  snapshot: {
    allServicesBlocked: boolean;
    blockedServices: RiderDispatchService[];
  }
): boolean {
  if (snapshot.allServicesBlocked || snapshot.blockedServices.length >= 3) return true;
  return snapshot.blockedServices.includes(serviceType);
}

export async function isRiderDispatchBlockedForService(
  riderId: number,
  serviceType: RiderDispatchService
): Promise<boolean> {
  const snapshot = await getRiderDispatchBlockSnapshot(riderId);
  return snapshot.accountRestricted && isDispatchServiceBlocked(serviceType, snapshot);
}

export function filterUnrestrictedDispatchServices<T extends RiderDispatchService>(
  services: T[],
  snapshot: {
    allServicesBlocked: boolean;
    blockedServices: RiderDispatchService[];
  }
): T[] {
  if (snapshot.allServicesBlocked || snapshot.blockedServices.length >= 3) return [];
  const blocked = new Set(snapshot.blockedServices);
  return services.filter((service) => !blocked.has(service));
}

/** Align duty_logs with current restrictions (strip blocked services or go OFF). */
export async function syncRiderDutyWithRestrictions(riderId: number): Promise<{
  isOnDuty: boolean;
  allowedServiceTypes: RiderDispatchService[];
  blockedServiceTypes: RiderDispatchService[];
  accountRestricted: boolean;
  allServicesBlacklisted: boolean;
  lastUpdated: string;
}> {
  const db = getDb();
  const [restrictions, latest] = await Promise.all([
    getRiderAccountRestrictions(riderId),
    db
      .select({
        status: dutyLogs.status,
        serviceTypes: dutyLogs.serviceTypes,
        timestamp: dutyLogs.timestamp,
      })
      .from(dutyLogs)
      .where(eq(dutyLogs.riderId, riderId))
      .orderBy(desc(dutyLogs.timestamp))
      .limit(1),
  ]);

  const blockedServiceTypes = restrictions.blacklistBlockedServices.filter(
    (s): s is RiderDispatchService =>
      s === "food" || s === "parcel" || s === "person_ride"
  );
  const row = latest[0];
  const lastUpdated =
    row?.timestamp instanceof Date
      ? row.timestamp.toISOString()
      : row?.timestamp
        ? new Date(String(row.timestamp)).toISOString()
        : new Date().toISOString();

  const { isRiderSubscriptionDispatchBlocked, forceRiderOffDutyForSubscriptionPenalty } =
    await import("./rider-subscription-wallet.js");
  const subscriptionDutyStopped = await isRiderSubscriptionDispatchBlocked(riderId);

  if (subscriptionDutyStopped) {
    if (row?.status === "ON") {
      await forceRiderOffDutyForSubscriptionPenalty(riderId);
    }
    return {
      isOnDuty: false,
      allowedServiceTypes: [],
      blockedServiceTypes,
      accountRestricted: restrictions.accountRestricted,
      allServicesBlacklisted: restrictions.allServicesBlacklisted,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Wallet penalty stop — same AUTO_OFF path as subscription (toggle must not stay ON).
  if (restrictions.penaltyDutyStopped) {
    if (row?.status === "ON") {
      await forceRiderOffDutyForSubscriptionPenalty(riderId);
    }
    return {
      isOnDuty: false,
      allowedServiceTypes: [],
      blockedServiceTypes,
      accountRestricted: restrictions.accountRestricted,
      allServicesBlacklisted: restrictions.allServicesBlacklisted,
      lastUpdated: new Date().toISOString(),
    };
  }

  if (row?.status !== "ON") {
    return {
      isOnDuty: false,
      allowedServiceTypes: [],
      blockedServiceTypes,
      accountRestricted: restrictions.accountRestricted,
      allServicesBlacklisted: restrictions.allServicesBlacklisted,
      lastUpdated,
    };
  }

  const currentServices = normalizeBlockedServiceList(
    Array.isArray(row.serviceTypes)
      ? row.serviceTypes.map((service) => String(service))
      : []
  );
  const { computeRiderEligibleDispatchServices } = await import("./order-assignment-engine.js");
  const engineAllowed = (await computeRiderEligibleDispatchServices(riderId)) ?? [];
  const allowed = engineAllowed;

  const servicesUnchanged =
    allowed.length === currentServices.length &&
    allowed.every((service) => currentServices.includes(service));

  if (servicesUnchanged && allowed.length > 0) {
    return {
      isOnDuty: true,
      allowedServiceTypes: allowed,
      blockedServiceTypes,
      accountRestricted: restrictions.accountRestricted,
      allServicesBlacklisted: restrictions.allServicesBlacklisted,
      lastUpdated,
    };
  }

  const now = new Date();
  if (allowed.length === 0) {
    await recordRiderDutyLog({
      riderId,
      status: "AUTO_OFF",
      serviceTypes: [],
      source: "system",
      metadata: { reason: "all_services_blocked" },
    });
    return {
      isOnDuty: false,
      allowedServiceTypes: [],
      blockedServiceTypes,
      accountRestricted: restrictions.accountRestricted,
      allServicesBlacklisted: restrictions.allServicesBlacklisted,
      lastUpdated: now.toISOString(),
    };
  }

  await recordRiderDutyLog({
    riderId,
    status: "ON",
    serviceTypes: allowed,
    source: "system",
    metadata: { reason: "services_trimmed_after_restriction_change" },
  });

  return {
    isOnDuty: true,
    allowedServiceTypes: allowed,
    blockedServiceTypes,
    accountRestricted: restrictions.accountRestricted,
    allServicesBlacklisted: restrictions.allServicesBlacklisted,
    lastUpdated: now.toISOString(),
  };
}

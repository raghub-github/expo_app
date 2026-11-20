/**
 * Rider blacklist/whitelist by wallet — the dashboard twin of the backend's
 * rider-negative-wallet-blocks.ts. Same policy row, same rules:
 * - Wallet floor (Super Admin "Global block threshold", default −₹200): a rider is
 *   ACTIVE while the balance is ABOVE it; at or below it ALL services are blocked
 *   (global_emergency) until the balance is back above the floor.
 * - Per-service penalty threshold (default 50): block a service only when its
 *   effective negative usage (negative_used − unblock_alloc) exceeds it.
 * - Positive balance with auto-unblock on → clear engine blocks, reset usage.
 * - Only engine-owned rows (negative_wallet / global_emergency) are recomputed;
 *   fraud / manual / compliance blocks are never touched here.
 */

import { getDb, getSql } from "@/lib/db/client";
import { riderWallet, riderNegativeWalletBlocks } from "@/lib/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  DEFAULT_WALLET_ACTIVE_FLOOR,
  isWalletAtOrBelowFloor,
  normalizeWalletActiveFloor,
} from "@gatimitra/financial-rules";

/** Fallback per-service penalty threshold (live value: ride_wallet_config). */
export const NEGATIVE_WALLET_THRESHOLD = 50;
/** Fallback wallet floor (live value: ride_wallet_config.global_block_threshold). */
export const GLOBAL_BLOCK_THRESHOLD = DEFAULT_WALLET_ACTIVE_FLOOR;

export type WalletBlockPolicy = {
  /** Active while balance > floor. */
  floor: number;
  serviceNegativeThreshold: number;
  autoUnblockOnZero: boolean;
};

let cachedPolicy: { value: WalletBlockPolicy; at: number } | null = null;
const POLICY_TTL_MS = 30_000;

/** The active Super Admin wallet policy (30 s cache), defaults if unreadable. */
export async function loadWalletBlockPolicy(): Promise<WalletBlockPolicy> {
  if (cachedPolicy && Date.now() - cachedPolicy.at < POLICY_TTL_MS) return cachedPolicy.value;
  let value: WalletBlockPolicy = {
    floor: DEFAULT_WALLET_ACTIVE_FLOOR,
    serviceNegativeThreshold: NEGATIVE_WALLET_THRESHOLD,
    autoUnblockOnZero: true,
  };
  try {
    const rows = (await getSql()`
      SELECT service_negative_threshold, global_block_threshold, auto_unblock_on_zero
      FROM ride_wallet_config
      WHERE is_active = TRUE
      ORDER BY id DESC
      LIMIT 1
    `) as unknown as Array<{
      service_negative_threshold: string | number | null;
      global_block_threshold: string | number | null;
      auto_unblock_on_zero: boolean | null;
    }>;
    const row = rows[0];
    if (row) {
      const svc = Number(row.service_negative_threshold);
      value = {
        floor: normalizeWalletActiveFloor(row.global_block_threshold),
        serviceNegativeThreshold: Number.isFinite(svc) && svc > 0 ? svc : NEGATIVE_WALLET_THRESHOLD,
        autoUnblockOnZero: row.auto_unblock_on_zero !== false,
      };
    }
  } catch {
    /* table missing in a fresh env → defaults */
  }
  cachedPolicy = { value, at: Date.now() };
  return value;
}

/** The wallet floor: a rider is active while the balance is above it. */
export async function loadWalletActiveFloor(): Promise<number> {
  return (await loadWalletBlockPolicy()).floor;
}

const SERVICES = ["food", "parcel", "person_ride"] as const;

type ServiceType = (typeof SERVICES)[number];

interface WalletRow {
  totalBalance: string | null;
  negativeUsedFood?: string;
  negativeUsedParcel?: string;
  negativeUsedPersonRide?: string;
  unblockAllocFood?: string;
  unblockAllocParcel?: string;
  unblockAllocPersonRide?: string;
}

/** effective_negative = negative_used - unblock_alloc; block when > NEGATIVE_WALLET_THRESHOLD (50). */
function getEffectiveNegative(wallet: WalletRow, service: ServiceType): number {
  const used =
    service === "food"
      ? Number(wallet.negativeUsedFood ?? 0)
      : service === "parcel"
        ? Number(wallet.negativeUsedParcel ?? 0)
        : Number(wallet.negativeUsedPersonRide ?? 0);
  const alloc =
    service === "food"
      ? Number(wallet.unblockAllocFood ?? 0)
      : service === "parcel"
        ? Number(wallet.unblockAllocParcel ?? 0)
        : Number(wallet.unblockAllocPersonRide ?? 0);
  return used - alloc;
}

/**
 * Sync rider_negative_wallet_blocks for a rider (engine-owned rows only).
 * - balance > 0 (auto-unblock on): clear engine blocks, reset negative_used + unblock_alloc.
 * - balance <= floor (−₹200 default): block all services (global_emergency).
 * - else: block only services whose effective negative usage exceeds the per-service threshold.
 */
export async function syncNegativeWalletBlocks(riderId: number): Promise<void> {
  const db = getDb();
  const policy = await loadWalletBlockPolicy();

  const [wallet] = await db
    .select()
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);

  // Only rows this engine owns. Fraud / manual / compliance blocks must never be
  // wiped by a wallet event (the old version deleted every row for the rider).
  await db
    .delete(riderNegativeWalletBlocks)
    .where(
      and(
        eq(riderNegativeWalletBlocks.riderId, riderId),
        inArray(riderNegativeWalletBlocks.reason, ["negative_wallet", "global_emergency"])
      )
    );

  if (!wallet) return;

  const w = wallet as WalletRow;
  const totalBalance = Number(w.totalBalance ?? 0);

  // Positive wallet → no engine blocks; reset usage so the threshold restarts next time.
  if (totalBalance > 0 && policy.autoUnblockOnZero) {
    await db
      .update(riderWallet)
      .set({
        negativeUsedFood: "0",
        negativeUsedParcel: "0",
        negativeUsedPersonRide: "0",
        unblockAllocFood: "0",
        unblockAllocParcel: "0",
        unblockAllocPersonRide: "0",
        lastUpdatedAt: new Date(),
      })
      .where(eq(riderWallet.riderId, riderId));
    return;
  }

  // At or below the floor → every service blocked until the balance is back above it.
  if (isWalletAtOrBelowFloor(totalBalance, policy.floor)) {
    for (const service of SERVICES) {
      await db
        .insert(riderNegativeWalletBlocks)
        .values({ riderId, serviceType: service, reason: "global_emergency" })
        .onConflictDoNothing();
    }
    return;
  }

  // Per-service penalty threshold.
  for (const service of SERVICES) {
    const effectiveNegative = getEffectiveNegative(w, service);
    if (effectiveNegative > policy.serviceNegativeThreshold) {
      await db
        .insert(riderNegativeWalletBlocks)
        .values({ riderId, serviceType: service, reason: "negative_wallet" })
        .onConflictDoNothing();
    }
  }
}

/**
 * Check if rider is blocked for a given service due to negative wallet.
 */
export async function isRiderBlockedForServiceDueToNegativeWallet(
  riderId: number,
  serviceType: string
): Promise<boolean> {
  if (!["food", "parcel", "person_ride"].includes(serviceType)) return false;
  const db = getDb();
  const [row] = await db
    .select()
    .from(riderNegativeWalletBlocks)
    .where(
      and(
        eq(riderNegativeWalletBlocks.riderId, riderId),
        eq(riderNegativeWalletBlocks.serviceType, serviceType)
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Apply generic credit in FIFO order: allocate to first blocked service until effective_negative <= 50, then next.
 * Uses effective_negative = negative_used - unblock_alloc. Call after caller has updated total_balance.
 */
export async function applyFifoAllocation(
  riderId: number,
  amount: number
): Promise<void> {
  if (amount <= 0) return;
  const db = getDb();
  const { serviceNegativeThreshold } = await loadWalletBlockPolicy();

  const [wallet] = await db
    .select()
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);
  if (!wallet) return;

  const w = wallet as WalletRow;
  const blocks = await db
    .select({ serviceType: riderNegativeWalletBlocks.serviceType })
    .from(riderNegativeWalletBlocks)
    .where(eq(riderNegativeWalletBlocks.riderId, riderId))
    .orderBy(asc(riderNegativeWalletBlocks.createdAt));

  let allocFood = Number(w.unblockAllocFood ?? 0);
  let allocParcel = Number(w.unblockAllocParcel ?? 0);
  let allocPerson = Number(w.unblockAllocPersonRide ?? 0);
  let remaining = amount;

  const getEffectiveNeg = (s: ServiceType) => {
    const used =
      s === "food"
        ? Number(w.negativeUsedFood ?? 0)
        : s === "parcel"
          ? Number(w.negativeUsedParcel ?? 0)
          : Number(w.negativeUsedPersonRide ?? 0);
    const alloc =
      s === "food" ? allocFood : s === "parcel" ? allocParcel : allocPerson;
    return used - alloc;
  };

  for (const b of blocks) {
    if (remaining <= 0) break;
    const service = b.serviceType as ServiceType;
    if (!SERVICES.includes(service)) continue;
    const effectiveNeg = getEffectiveNeg(service);
    const needToUnblock = Math.max(0, effectiveNeg - serviceNegativeThreshold);
    const alloc = Math.min(remaining, needToUnblock);
    if (alloc <= 0) continue;
    if (service === "food") allocFood += alloc;
    else if (service === "parcel") allocParcel += alloc;
    else allocPerson += alloc;
    remaining -= alloc;
  }

  await db
    .update(riderWallet)
    .set({
      unblockAllocFood: allocFood.toFixed(2),
      unblockAllocParcel: allocParcel.toFixed(2),
      unblockAllocPersonRide: allocPerson.toFixed(2),
      lastUpdatedAt: new Date(),
    })
    .where(eq(riderWallet.riderId, riderId));

  await syncNegativeWalletBlocks(riderId);
}

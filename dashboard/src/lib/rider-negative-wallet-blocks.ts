/**
 * Rider blacklist/whitelist by wallet: service-level negative tracking.
 * - RULE 1: If wallet >= 0 after event → no block, no threshold; reset negative_used when balance >= 0.
 * - RULE 2: Threshold -50 per service: block only when (negative_used - unblock_alloc) > 50 for that service.
 * - RULE 3: total_balance <= -200 → block ALL (global_emergency); when >= 0 → unblock all and reset negative_used.
 * - RULE 4: Auto recalc on penalty, revert, add balance (sync blocks + optional reset).
 * See backend/docs/schema/BLACKLIST_WHITELIST_REDESIGN.md
 */

import { getDb } from "@/lib/db/client";
import { riderWallet, riderNegativeWalletBlocks } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

/** Service block when effective_negative = (negative_used - unblock_alloc) > 50. */
export const NEGATIVE_WALLET_THRESHOLD = 50;
/** Global block when total_balance <= -200; unlock when total_balance >= 0. */
export const GLOBAL_BLOCK_THRESHOLD = -200;

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
 * Sync rider_negative_wallet_blocks for a rider.
 * - total_balance > 0: remove all blocks and reset negative_used + unblock_alloc to 0.
 * - total_balance <= -200: block all services (global_emergency).
 * - else: block only services where effective_negative (negative_used - unblock_alloc) > 50.
 */
export async function syncNegativeWalletBlocks(riderId: number): Promise<void> {
  const db = getDb();

  const [wallet] = await db
    .select()
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);

  await db
    .delete(riderNegativeWalletBlocks)
    .where(eq(riderNegativeWalletBlocks.riderId, riderId));

  if (!wallet) return;

  const w = wallet as WalletRow;
  const totalBalance = Number(w.totalBalance ?? 0);

  // RULE 1 & 3: Positive wallet → no blocks; reset negative_used and unblock_alloc so threshold restarts when they go negative again
  if (totalBalance > 0) {
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

  // RULE 3: Extreme negative → block all
  if (totalBalance <= GLOBAL_BLOCK_THRESHOLD) {
    for (const service of SERVICES) {
      await db.insert(riderNegativeWalletBlocks).values({
        riderId,
        serviceType: service,
        reason: "global_emergency",
      });
    }
    return;
  }

  // RULE 2: Block only services where effective_negative > 50
  for (const service of SERVICES) {
    const effectiveNegative = getEffectiveNegative(w, service);
    if (effectiveNegative > NEGATIVE_WALLET_THRESHOLD) {
      await db.insert(riderNegativeWalletBlocks).values({
        riderId,
        serviceType: service,
        reason: "negative_wallet",
      });
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
    const needToUnblock = Math.max(0, effectiveNeg - NEGATIVE_WALLET_THRESHOLD);
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

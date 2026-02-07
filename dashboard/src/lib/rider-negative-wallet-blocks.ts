/**
 * Temporary block when rider wallet (per service) is negative beyond threshold.
 * Global block: total_balance <= -200 blocks ALL services (unlock when >= 0).
 * Service block: effective_net = (earnings - penalties + unblock_alloc) <= -50.
 * FIFO: generic credits allocate to first blocked service first (applyFifoAllocation).
 */

import { getDb } from "@/lib/db/client";
import { riderWallet, riderNegativeWalletBlocks } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

/** Service block when effective_net <= -50. */
export const NEGATIVE_WALLET_THRESHOLD = -50;
/** Global block when total_balance <= -200; unlock when total_balance >= 0. */
export const GLOBAL_BLOCK_THRESHOLD = -200;

const SERVICES = ["food", "parcel", "person_ride"] as const;

type ServiceType = (typeof SERVICES)[number];

interface WalletRow {
  totalBalance: string | null;
  earningsFood: string;
  earningsParcel: string;
  earningsPersonRide: string;
  penaltiesFood: string;
  penaltiesParcel: string;
  penaltiesPersonRide: string;
  unblockAllocFood?: string;
  unblockAllocParcel?: string;
  unblockAllocPersonRide?: string;
}

function getEffectiveNet(wallet: WalletRow, service: ServiceType): number {
  const earnings =
    service === "food"
      ? Number(wallet.earningsFood)
      : service === "parcel"
        ? Number(wallet.earningsParcel)
        : Number(wallet.earningsPersonRide);
  const penalties =
    service === "food"
      ? Number(wallet.penaltiesFood)
      : service === "parcel"
        ? Number(wallet.penaltiesParcel)
        : Number(wallet.penaltiesPersonRide);
  const alloc =
    service === "food"
      ? Number(wallet.unblockAllocFood ?? 0)
      : service === "parcel"
        ? Number(wallet.unblockAllocParcel ?? 0)
        : Number(wallet.unblockAllocPersonRide ?? 0);
  return earnings - penalties + alloc;
}

/**
 * Sync rider_negative_wallet_blocks for a rider based on current wallet.
 * Block only when total balance is 0 or negative. While wallet is positive, we never block
 * (we only adjust balance); once balance becomes 0 or negative we apply per-service threshold
 * and global emergency threshold.
 * Matches DB trigger: no blocks when total_balance > 0; when total_balance <= 0: global if <= -200,
 * else block service when effective_net <= -50.
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

  // Do not block any service while total wallet balance is positive
  if (totalBalance > 0) return;

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

  // total_balance <= 0 but > -200: block only services where effective_net <= -50
  for (const service of SERVICES) {
    const effectiveNet = getEffectiveNet(w, service);
    if (effectiveNet <= NEGATIVE_WALLET_THRESHOLD) {
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
 * Apply generic credit in FIFO order: allocate to first blocked service (by created_at) until effective_net > -50, then next.
 * Updates rider_wallet (total_balance already updated by caller; this updates unblock_alloc_* and then triggers sync).
 * Call after inserting ledger entry for generic manual_add (no service_type).
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

  const getEffective = (s: ServiceType) => {
    const base = getEffectiveNet(w, s);
    const extra =
      s === "food"
        ? allocFood - Number(w.unblockAllocFood ?? 0)
        : s === "parcel"
          ? allocParcel - Number(w.unblockAllocParcel ?? 0)
          : allocPerson - Number(w.unblockAllocPersonRide ?? 0);
    return base + extra;
  };

  for (const b of blocks) {
    if (remaining <= 0) break;
    const service = b.serviceType as ServiceType;
    if (!SERVICES.includes(service)) continue;
    const effective =
      service === "food"
        ? getEffective("food")
        : service === "parcel"
          ? getEffective("parcel")
          : getEffective("person_ride");
    const deficit = Math.max(0, -49 - effective);
    const alloc = Math.min(remaining, deficit);
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

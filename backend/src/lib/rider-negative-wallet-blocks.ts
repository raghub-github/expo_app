import { eq, asc } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderNegativeWalletBlocks, riderWallet } from "../db/schema.js";

export const NEGATIVE_WALLET_THRESHOLD = 50;
export const GLOBAL_BLOCK_THRESHOLD = -200;

const SERVICES = ["food", "parcel", "person_ride"] as const;

type ServiceType = (typeof SERVICES)[number];

type WalletRow = {
  totalBalance: string | null;
  negativeUsedFood?: string;
  negativeUsedParcel?: string;
  negativeUsedPersonRide?: string;
  unblockAllocFood?: string;
  unblockAllocParcel?: string;
  unblockAllocPersonRide?: string;
};

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

/** Recompute rider_negative_wallet_blocks after wallet debits (penalties, etc.). */
export async function syncNegativeWalletBlocks(riderId: number): Promise<void> {
  const db = getDb();

  const [wallet] = await db
    .select()
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);

  await db.delete(riderNegativeWalletBlocks).where(eq(riderNegativeWalletBlocks.riderId, riderId));

  if (!wallet) return;

  const w = wallet as WalletRow;
  const totalBalance = Number(w.totalBalance ?? 0);

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
    const { syncRiderDutyWithRestrictions } = await import("./rider-account-restrictions.js");
    await syncRiderDutyWithRestrictions(riderId);
    return;
  }

  if (totalBalance <= GLOBAL_BLOCK_THRESHOLD) {
    for (const service of SERVICES) {
      await db.insert(riderNegativeWalletBlocks).values({
        riderId,
        serviceType: service,
        reason: "global_emergency",
      });
    }
    const { syncRiderDutyWithRestrictions } = await import("./rider-account-restrictions.js");
    await syncRiderDutyWithRestrictions(riderId);
    return;
  }

  for (const service of SERVICES) {
    if (getEffectiveNegative(w, service) > NEGATIVE_WALLET_THRESHOLD) {
      await db.insert(riderNegativeWalletBlocks).values({
        riderId,
        serviceType: service,
        reason: "negative_wallet",
      });
    }
  }

  const { syncRiderDutyWithRestrictions } = await import("./rider-account-restrictions.js");
  await syncRiderDutyWithRestrictions(riderId);
}

/** Allocate generic wallet credit in FIFO order across blocked services (dashboard parity). */
export async function applyFifoAllocation(riderId: number, amount: number): Promise<void> {
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
    const alloc = s === "food" ? allocFood : s === "parcel" ? allocParcel : allocPerson;
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

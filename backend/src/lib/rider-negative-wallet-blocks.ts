import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderNegativeWalletBlocks, riderWallet } from "../db/schema.js";
import { loadRideWalletPolicy } from "../modules/rides/settlement/rideSettlement.repository.js";

/**
 * Backwards-compatible default thresholds. The live values are sourced from
 * ride_wallet_config (Super Admin configurable) via loadRideWalletPolicy —
 * these constants are kept as the safety fallback whenever the policy row is
 * missing or the config table has not been created yet.
 */
export const NEGATIVE_WALLET_THRESHOLD = 50;
export const GLOBAL_BLOCK_THRESHOLD = -200;

async function resolveThresholds(): Promise<{
  serviceNegativeThreshold: number;
  globalBlockThreshold: number;
  autoUnblockOnZero: boolean;
}> {
  try {
    const policy = await loadRideWalletPolicy();
    return {
      serviceNegativeThreshold: Number.isFinite(policy.serviceNegativeThreshold)
        ? policy.serviceNegativeThreshold
        : NEGATIVE_WALLET_THRESHOLD,
      globalBlockThreshold: Number.isFinite(policy.globalBlockThreshold)
        ? policy.globalBlockThreshold
        : GLOBAL_BLOCK_THRESHOLD,
      autoUnblockOnZero: policy.autoUnblockOnZero !== false,
    };
  } catch {
    return {
      serviceNegativeThreshold: NEGATIVE_WALLET_THRESHOLD,
      globalBlockThreshold: GLOBAL_BLOCK_THRESHOLD,
      autoUnblockOnZero: true,
    };
  }
}

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

/**
 * Recompute rider_negative_wallet_blocks after wallet debits (penalties, cash
 * settlements, etc.). Only blocks with reasons owned by this policy engine —
 * `negative_wallet` and `global_emergency` — are recomputed. Blocks written
 * with any other reason (fraud, manual admin action, compliance, kyc, etc.)
 * are preserved so they never auto-clear when the wallet is topped up.
 */
export async function syncNegativeWalletBlocks(riderId: number): Promise<void> {
  const db = getDb();
  const thresholds = await resolveThresholds();

  const [wallet] = await db
    .select()
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);

  // Only clear the blocks THIS policy engine owns. Foreign reasons (fraud etc.)
  // must not be auto-cleared just because the wallet became positive.
  await db
    .delete(riderNegativeWalletBlocks)
    .where(
      and(
        eq(riderNegativeWalletBlocks.riderId, riderId),
        inArray(riderNegativeWalletBlocks.reason, [
          "negative_wallet",
          "global_emergency",
        ])
      )
    );

  if (!wallet) return;

  const w = wallet as WalletRow;
  const totalBalance = Number(w.totalBalance ?? 0);

  if (totalBalance > 0 && thresholds.autoUnblockOnZero) {
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

  if (totalBalance <= thresholds.globalBlockThreshold) {
    for (const service of SERVICES) {
      await db
        .insert(riderNegativeWalletBlocks)
        .values({
          riderId,
          serviceType: service,
          reason: "global_emergency",
        })
        .onConflictDoNothing();
    }
    const { syncRiderDutyWithRestrictions } = await import("./rider-account-restrictions.js");
    await syncRiderDutyWithRestrictions(riderId);
    return;
  }

  for (const service of SERVICES) {
    if (getEffectiveNegative(w, service) > thresholds.serviceNegativeThreshold) {
      await db
        .insert(riderNegativeWalletBlocks)
        .values({
          riderId,
          serviceType: service,
          reason: "negative_wallet",
        })
        .onConflictDoNothing();
    }
  }

  const { syncRiderDutyWithRestrictions } = await import("./rider-account-restrictions.js");
  await syncRiderDutyWithRestrictions(riderId);
}

/** Allocate generic wallet credit in FIFO order across blocked services (dashboard parity). */
export async function applyFifoAllocation(riderId: number, amount: number): Promise<void> {
  if (amount <= 0) return;
  const db = getDb();
  const thresholds = await resolveThresholds();

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
    const needToUnblock = Math.max(0, effectiveNeg - thresholds.serviceNegativeThreshold);
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

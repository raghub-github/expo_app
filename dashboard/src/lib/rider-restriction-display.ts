export type RiderServiceSlot = "food" | "parcel" | "person_ride" | "all";

export type NegativeWalletBlockRow = {
  serviceType: string;
  reason: string;
  createdAt?: string;
};

export type BlacklistServiceStatus = {
  isBanned?: boolean;
  reason?: string;
  isPermanent?: boolean;
  expiresAt?: string | null;
  source?: string;
  actorEmail?: string | null;
  actorName?: string | null;
  remainingMs?: number | null;
  partiallyAllowedServices?: string[];
};

export function serviceSlotLabel(service: RiderServiceSlot): string {
  return service === "all" ? "All Services" : service.replace("_", " ");
}

export function isServiceNegativeWalletBlocked(
  service: RiderServiceSlot,
  globalWalletBlock: boolean,
  negativeWalletBlocks: NegativeWalletBlockRow[]
): boolean {
  if (globalWalletBlock) return true;
  if (service === "all") {
    return negativeWalletBlocks.length >= 3;
  }
  return negativeWalletBlocks.some((block) => block.serviceType === service);
}

export function resolveRiderServiceRestriction(input: {
  service: RiderServiceSlot;
  blacklist?: BlacklistServiceStatus | null;
  globalWalletBlock: boolean;
  negativeWalletBlocks: NegativeWalletBlockRow[];
}): {
  isBlocked: boolean;
  isBannedByBlacklist: boolean;
  isBlockedByWalletOnly: boolean;
  statusLabel: string;
  unlockHint: string | null;
} {
  const isBannedByBlacklist = input.blacklist?.isBanned ?? false;
  const hasNegativeWalletBlock = isServiceNegativeWalletBlocked(
    input.service,
    input.globalWalletBlock,
    input.negativeWalletBlocks
  );
  const isBlocked = isBannedByBlacklist || hasNegativeWalletBlock;
  const isBlockedByWalletOnly = hasNegativeWalletBlock && !isBannedByBlacklist;

  let statusLabel = isBlocked ? (isBlockedByWalletOnly ? "Blocked" : "Banned") : "Allowed";
  if (
    input.service === "all" &&
    input.blacklist?.partiallyAllowedServices &&
    input.blacklist.partiallyAllowedServices.length > 0
  ) {
    statusLabel = `Partially allowed (${input.blacklist.partiallyAllowedServices
      .map((s) => s.replace("_", " "))
      .join(", ")})`;
  }

  // A global wallet block lifts as soon as the balance is back ABOVE the floor
  // (−₹200 by default) — not at ₹0. Per-service blocks follow the penalty limit.
  const unlockHint = isBlockedByWalletOnly
    ? input.globalWalletBlock
      ? "Unlocks when the balance is above the wallet floor (−₹200 by default)"
      : "Unlocks when this service's penalty debt is within the limit"
    : null;

  return {
    isBlocked,
    isBannedByBlacklist,
    isBlockedByWalletOnly,
    statusLabel,
    unlockHint,
  };
}

export function walletBlockHistoryReason(block: NegativeWalletBlockRow, globalWalletBlock: boolean): string {
  if (block.reason === "global_emergency" || globalWalletBlock) {
    return "Wallet balance at or below the wallet floor (−₹200 by default) — all services auto-blocked";
  }
  const service = block.serviceType === "person_ride" ? "Person ride" : block.serviceType;
  return `Negative wallet balance exceeded threshold for ${service}`;
}

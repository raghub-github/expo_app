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

  const unlockHint = isBlockedByWalletOnly
    ? input.globalWalletBlock
      ? "Unlocks when balance ≥ 0"
      : "Unlocks when balance > -50 for this service"
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
    return "Wallet balance below -₹200 — all services auto-blocked";
  }
  const service = block.serviceType === "person_ride" ? "Person ride" : block.serviceType;
  return `Negative wallet balance exceeded threshold for ${service}`;
}

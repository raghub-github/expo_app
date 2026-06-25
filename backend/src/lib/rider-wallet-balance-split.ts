/**
 * Split a negative rider wallet between penalty-driven and subscription-driven portions.
 * Penalties update rider_wallet.negative_used_*; subscription debits do not.
 */

const MAX_SUBSCRIPTION_NEGATIVE_BALANCE = 35;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type WalletNegativeFields = {
  negativeUsedFood?: string | number | null;
  negativeUsedParcel?: string | number | null;
  negativeUsedPersonRide?: string | number | null;
  unblockAllocFood?: string | number | null;
  unblockAllocParcel?: string | number | null;
  unblockAllocPersonRide?: string | null | number;
  penaltiesFood?: string | number | null;
  penaltiesParcel?: string | number | null;
  penaltiesPersonRide?: string | number | null;
};

function num(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function getPenaltyNegativeUsedTotal(wallet: WalletNegativeFields | null | undefined): number {
  if (!wallet) return 0;
  const services = [
    {
      used: num(wallet.negativeUsedFood),
      alloc: num(wallet.unblockAllocFood),
    },
    {
      used: num(wallet.negativeUsedParcel),
      alloc: num(wallet.unblockAllocParcel),
    },
    {
      used: num(wallet.negativeUsedPersonRide),
      alloc: num(wallet.unblockAllocPersonRide),
    },
  ] as const;

  let total = 0;
  for (const row of services) {
    total += Math.max(0, row.used - row.alloc);
  }
  return round2(total);
}

function getTotalPenaltiesColumnSum(wallet: WalletNegativeFields | null | undefined): number {
  if (!wallet) return 0;
  return round2(
    num(wallet.penaltiesFood) + num(wallet.penaltiesParcel) + num(wallet.penaltiesPersonRide)
  );
}

export type WalletNegativeSplit = {
  walletBalance: number;
  penaltyNegative: number;
  subscriptionNegative: number;
};

export type SplitWalletNegativeOptions = {
  subscriptionDuesOutstanding?: number;
  activePenaltyTotal?: number;
};

export function splitWalletNegativeBalance(
  walletBalance: number,
  wallet: WalletNegativeFields | null | undefined,
  opts?: SplitWalletNegativeOptions
): WalletNegativeSplit {
  const balance = round2(walletBalance);
  const subscriptionDues = round2(Math.max(0, opts?.subscriptionDuesOutstanding ?? 0));
  const activePenaltyTotal = round2(Math.max(0, opts?.activePenaltyTotal ?? 0));

  let penaltyNegative = getPenaltyNegativeUsedTotal(wallet);

  if (penaltyNegative <= 0 && balance < 0) {
    const penaltiesColumnSum = getTotalPenaltiesColumnSum(wallet);
    if (penaltiesColumnSum > 0) {
      penaltyNegative = round2(Math.min(-balance, penaltiesColumnSum));
    } else if (activePenaltyTotal > 0) {
      penaltyNegative = round2(Math.min(-balance, activePenaltyTotal));
    }
  }

  let subscriptionNegative =
    balance < 0 ? round2(Math.max(0, -balance - penaltyNegative)) : 0;

  if (subscriptionDues <= 0 && subscriptionNegative > 0 && activePenaltyTotal > 0) {
    penaltyNegative = round2(penaltyNegative + subscriptionNegative);
    subscriptionNegative = 0;
  }

  if (subscriptionDues <= 0 && balance < 0 && penaltyNegative <= 0) {
    subscriptionNegative = round2(-balance);
    penaltyNegative = 0;
  }

  if (subscriptionDues > 0 && subscriptionNegative > MAX_SUBSCRIPTION_NEGATIVE_BALANCE) {
    const overflow = round2(subscriptionNegative - MAX_SUBSCRIPTION_NEGATIVE_BALANCE);
    penaltyNegative = round2(penaltyNegative + overflow);
    subscriptionNegative = MAX_SUBSCRIPTION_NEGATIVE_BALANCE;
  }

  return { walletBalance: balance, penaltyNegative, subscriptionNegative };
}

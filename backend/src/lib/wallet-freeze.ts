/**
 * Unified wallet freeze helpers for Rider and Merchant.
 * Freeze state lives on the wallet row; this module is the shared error/contract.
 */

export const WALLET_FROZEN_CODE = "WALLET_FROZEN" as const;

export class WalletFrozenError extends Error {
  readonly code = WALLET_FROZEN_CODE;
  readonly freezeReason: string | null;

  constructor(freezeReason?: string | null) {
    const reason = typeof freezeReason === "string" ? freezeReason.trim() || null : null;
    super(
      reason
        ? `Withdrawals are currently disabled. Reason: ${reason}`
        : "Withdrawals are currently disabled.",
    );
    this.name = "WalletFrozenError";
    this.freezeReason = reason;
  }
}

export function isWalletFrozenError(err: unknown): err is WalletFrozenError {
  if (err instanceof WalletFrozenError) return true;
  if (!err || typeof err !== "object") return false;
  return (err as { code?: unknown }).code === WALLET_FROZEN_CODE;
}

export function walletFrozenHttpBody(err: WalletFrozenError): {
  code: typeof WALLET_FROZEN_CODE;
  error: string;
  freezeReason: string | null;
} {
  return {
    code: WALLET_FROZEN_CODE,
    error: err.message,
    freezeReason: err.freezeReason,
  };
}

export function isMerchantWalletFrozenStatus(status: unknown): boolean {
  return String(status ?? "").toUpperCase() === "FROZEN";
}

export function merchantWalletFreezeView(row: {
  status?: unknown;
  frozen_reason?: unknown;
  frozenReason?: unknown;
  frozen_at?: unknown;
  frozenAt?: unknown;
}): {
  isFrozen: boolean;
  freezeReason: string | null;
  frozenAt: string | null;
  status: string;
} {
  const status = String(row.status ?? "ACTIVE").toUpperCase() || "ACTIVE";
  const isFrozen = status === "FROZEN";
  const rawReason = row.frozen_reason ?? row.frozenReason;
  const reason =
    typeof rawReason === "string" && rawReason.trim() ? rawReason.trim() : null;
  const rawAt = row.frozen_at ?? row.frozenAt;
  let frozenAt: string | null = null;
  if (isFrozen && rawAt) {
    const d = rawAt instanceof Date ? rawAt : new Date(String(rawAt));
    if (!Number.isNaN(d.getTime())) frozenAt = d.toISOString();
  }
  return {
    isFrozen,
    freezeReason: isFrozen ? reason : null,
    frozenAt,
    status,
  };
}

export function throwIfMerchantWalletFrozen(row: {
  status?: unknown;
  frozen_reason?: unknown;
  frozenReason?: unknown;
}): void {
  const view = merchantWalletFreezeView(row);
  if (view.isFrozen) {
    throw new WalletFrozenError(view.freezeReason);
  }
}

export function walletFrozenFromDebitMessage(
  message: string,
  freezeReason: string | null,
): WalletFrozenError | null {
  if (/wallet not allowed to debit/i.test(message) && /FROZEN/i.test(message)) {
    return new WalletFrozenError(freezeReason);
  }
  return null;
}

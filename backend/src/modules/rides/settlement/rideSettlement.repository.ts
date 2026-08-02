import type { Sql } from "postgres";
import { getSql } from "../../../db/client.js";

/**
 * Ride Settlement + Wallet-Config repositories.
 * Thin postgres wrappers so the engine has no drizzle coupling — matches the
 * pattern used by the penalty/wallet services elsewhere in this codebase.
 */

export type RideWalletPolicy = {
  serviceNegativeThreshold: number;
  globalBlockThreshold: number;
  cashSettlementEnabled: boolean;
  autoUnblockOnZero: boolean;
  commissionOnToll: boolean;
};

const DEFAULT_POLICY: RideWalletPolicy = {
  serviceNegativeThreshold: 50,
  globalBlockThreshold: -200,
  cashSettlementEnabled: true,
  autoUnblockOnZero: true,
  commissionOnToll: false,
};

let cachedPolicy: { value: RideWalletPolicy; loadedAt: number } | null = null;
const POLICY_CACHE_MS = 30_000;

/**
 * Effective Ride Wallet policy. Cached for 30s so hot paths (every wallet
 * mutation, every fare quote) do not hammer the DB. Cache is invalidated
 * whenever admin writes via updateRideWalletPolicy().
 */
export async function loadRideWalletPolicy(
  sql: Sql = getSql(),
  opts: { forceRefresh?: boolean } = {}
): Promise<RideWalletPolicy> {
  const now = Date.now();
  if (
    !opts.forceRefresh &&
    cachedPolicy &&
    now - cachedPolicy.loadedAt < POLICY_CACHE_MS
  ) {
    return cachedPolicy.value;
  }

  try {
    const rows = await sql<
      Array<{
        service_negative_threshold: string | number;
        global_block_threshold: string | number;
        cash_settlement_enabled: boolean;
        auto_unblock_on_zero: boolean;
        commission_on_toll?: boolean;
      }>
    >`
      SELECT service_negative_threshold,
             global_block_threshold,
             cash_settlement_enabled,
             auto_unblock_on_zero,
             COALESCE(commission_on_toll, FALSE) AS commission_on_toll
      FROM ride_wallet_config
      WHERE is_active = TRUE
      ORDER BY id DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      cachedPolicy = { value: DEFAULT_POLICY, loadedAt: now };
      return DEFAULT_POLICY;
    }
    const value: RideWalletPolicy = {
      serviceNegativeThreshold: Number(row.service_negative_threshold ?? 50),
      globalBlockThreshold: Number(row.global_block_threshold ?? -200),
      cashSettlementEnabled: row.cash_settlement_enabled !== false,
      autoUnblockOnZero: row.auto_unblock_on_zero !== false,
      commissionOnToll: row.commission_on_toll === true,
    };
    cachedPolicy = { value, loadedAt: now };
    return value;
  } catch {
    // Table might not exist yet in a fresh dev environment. Fall back to
    // defaults so we never break the runtime — the caller will still function
    // exactly as today.
    return DEFAULT_POLICY;
  }
}

export function clearRideWalletPolicyCache(): void {
  cachedPolicy = null;
}

export type UpdateRideWalletPolicyInput = {
  serviceNegativeThreshold: number;
  globalBlockThreshold: number;
  cashSettlementEnabled?: boolean;
  autoUnblockOnZero?: boolean;
  commissionOnToll?: boolean;
  changedBySystemUserId?: number | null;
  reason?: string | null;
};

/**
 * Write a new active policy. The previous active row is soft-deactivated and
 * an entry is appended to ride_wallet_config_history for audit.
 */
export async function updateRideWalletPolicy(
  input: UpdateRideWalletPolicyInput,
  sql: Sql = getSql()
): Promise<RideWalletPolicy> {
  const serviceNeg = Number(input.serviceNegativeThreshold);
  const globalBlock = Number(input.globalBlockThreshold);
  if (!Number.isFinite(serviceNeg) || serviceNeg <= 0) {
    throw Object.assign(new Error("service_negative_threshold must be positive"), {
      statusCode: 400,
    });
  }
  if (!Number.isFinite(globalBlock) || globalBlock >= 0) {
    throw Object.assign(new Error("global_block_threshold must be negative"), {
      statusCode: 400,
    });
  }
  const cashEnabled = input.cashSettlementEnabled !== false;
  const autoUnblock = input.autoUnblockOnZero !== false;
  const commissionOnToll = input.commissionOnToll === true;

  await sql.begin(async (tx) => {
    await tx`
      UPDATE ride_wallet_config
      SET is_active = FALSE, updated_at = NOW()
      WHERE is_active = TRUE
    `;
    await tx`
      INSERT INTO ride_wallet_config (
        service_negative_threshold, global_block_threshold,
        cash_settlement_enabled, auto_unblock_on_zero, commission_on_toll,
        is_active, updated_by_system_user_id, notes
      ) VALUES (
        ${serviceNeg}, ${globalBlock}, ${cashEnabled}, ${autoUnblock}, ${commissionOnToll},
        TRUE, ${input.changedBySystemUserId ?? null}, ${input.reason ?? null}
      )
    `;
    await tx`
      INSERT INTO ride_wallet_config_history (
        service_negative_threshold, global_block_threshold,
        cash_settlement_enabled, auto_unblock_on_zero, commission_on_toll,
        changed_by_system_user_id, reason
      ) VALUES (
        ${serviceNeg}, ${globalBlock}, ${cashEnabled}, ${autoUnblock}, ${commissionOnToll},
        ${input.changedBySystemUserId ?? null}, ${input.reason ?? null}
      )
    `;
  });

  clearRideWalletPolicyCache();
  return loadRideWalletPolicy(sql, { forceRefresh: true });
}

// ---------------------------------------------------------------------------
// Ride settlement lookups
// ---------------------------------------------------------------------------

export function buildSettlementId(orderCoreId: number): string {
  return `ride_settle:v1:${orderCoreId}`;
}

export type ExistingRideSettlement = {
  settlementId: string;
  paymentMode: string;
  status: string;
  companyReceivable: number;
  companyReceived: number;
  walletDebit: number;
  walletCredit: number;
  riderEarnings: number;
  createdAt: string;
};

export async function findExistingSettlement(
  orderCoreId: number,
  sql: Sql = getSql()
): Promise<ExistingRideSettlement | null> {
  const rows = await sql<
    Array<{
      settlement_id: string;
      payment_mode: string;
      status: string;
      company_receivable: string;
      company_received: string;
      wallet_debit: string;
      wallet_credit: string;
      rider_earnings: string;
      created_at: string;
    }>
  >`
    SELECT settlement_id, payment_mode, status,
           company_receivable, company_received,
           wallet_debit, wallet_credit, rider_earnings,
           created_at
    FROM ride_settlements
    WHERE order_core_id = ${orderCoreId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    settlementId: row.settlement_id,
    paymentMode: row.payment_mode,
    status: row.status,
    companyReceivable: Number(row.company_receivable ?? 0),
    companyReceived: Number(row.company_received ?? 0),
    walletDebit: Number(row.wallet_debit ?? 0),
    walletCredit: Number(row.wallet_credit ?? 0),
    riderEarnings: Number(row.rider_earnings ?? 0),
    createdAt: row.created_at,
  };
}

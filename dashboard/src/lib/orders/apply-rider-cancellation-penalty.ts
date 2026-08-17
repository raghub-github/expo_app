import { getDb, getSql } from "@/lib/db/client";
import {
  riderPenalties,
  riderWallet,
  riders,
  walletLedger,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { syncNegativeWalletBlocks } from "@/lib/rider-negative-wallet-blocks";
import { resolveRiderDeliveryFeeFromCore } from "@/lib/credit-rider-order-on-delivered";
import type {
  RiderPenaltyAmountBase,
  RiderPenaltyScenarioCode,
} from "@/lib/rider-cancellation-penalty-engine.types";

export type ApplyRiderCancellationPenaltyInput = {
  orderCoreId: number;
  riderId: number;
  catalogReasonId: number;
  /** e.g. 3pl_fault from refund modal */
  fault?: string | null;
  /** e.g. RIDER from catalog */
  attribute?: string | null;
  cancellationReasonId?: number | null;
  actorSystemUserId?: number | null;
  source: "rider_management" | "order_refund";
  /** When true, scenario penalty applies for admin 3PL even if reason rule is unset. */
  skipReasonPenaltyCheck?: boolean;
  /** FMRE execution payload (gm_execute_rule result). */
  engineRaw?: Record<string, unknown> | null;
  refundType?: string | null;
};

export type ApplyRiderCancellationPenaltyResult = {
  applied: boolean;
  skipped?: string;
  scenarioCode?: RiderPenaltyScenarioCode;
  amount?: number;
  penaltyId?: number;
  ledgerTitle?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isRelationMissingError(e: unknown): boolean {
  if (e && typeof e === "object") {
    const o = e as { code?: string; message?: string };
    if (o.code === "42P01") return true;
    if (typeof o.message === "string" && /relation .* does not exist/i.test(o.message)) {
      return true;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /relation .* does not exist/i.test(msg) || msg.includes("42P01");
}

function normalizeFault(fault: string | null | undefined): string {
  return String(fault ?? "")
    .trim()
    .toLowerCase();
}

function isThreePlFault(input: ApplyRiderCancellationPenaltyInput): boolean {
  const fault = normalizeFault(input.fault);
  return fault === "3pl_fault" || fault === "3pl";
}

function penaltyLedgerRef(
  orderCoreId: number,
  riderId: number,
  scenarioCode: RiderPenaltyScenarioCode
): string {
  return `rider_cancel_pen:${orderCoreId}:${riderId}:${scenarioCode}`;
}

function fmreRiderPenaltyLedgerRef(orderCoreId: number, engineRaw: Record<string, unknown>): string {
  const logId = engineRaw.execution_log_id ?? engineRaw.executionLogId;
  const ruleId = engineRaw.rule_id ?? engineRaw.ruleId;
  const suffix =
    logId != null && String(logId).trim() !== ""
      ? String(logId)
      : ruleId != null && String(ruleId).trim() !== ""
        ? `rule_${ruleId}`
        : "cancel";
  return `gm_rule_rider_pen:${orderCoreId}:${suffix}`;
}

export function extractFmreRiderPenalty(engineRaw: Record<string, unknown> | null | undefined): {
  penalty: number;
  walletDebit: boolean;
  ruleCode: string | null;
  engineApplied: boolean;
} {
  if (!engineRaw || engineRaw.ok !== true) {
    return { penalty: 0, walletDebit: false, ruleCode: null, engineApplied: false };
  }
  const amounts = engineRaw.amounts as Record<string, unknown> | undefined;
  const rider = (amounts?.rider ?? {}) as Record<string, unknown>;
  const penalty = round2(Math.max(0, Number(rider.penalty ?? 0)));
  const walletDebit = rider.wallet_debit !== false && rider.walletDebit !== false;
  const ruleCode =
    typeof engineRaw.rule_code === "string"
      ? engineRaw.rule_code
      : typeof engineRaw.ruleCode === "string"
        ? engineRaw.ruleCode
        : null;
  return { penalty, walletDebit, ruleCode, engineApplied: true };
}

function isOrderPickedUpAtCancellation(row: {
  assignment_picked_up_at: string | null;
  rider_picked_up_at: string | null;
  delivery_picked_up_at: string | null;
  actual_pickup_time: string | null;
  core_status: string | null;
  current_status: string | null;
  assignment_status: string | null;
}): boolean {
  if (
    row.assignment_picked_up_at ||
    row.rider_picked_up_at ||
    row.delivery_picked_up_at ||
    row.actual_pickup_time
  ) {
    return true;
  }

  const assignmentStatus = String(row.assignment_status ?? "").trim().toUpperCase();
  if (assignmentStatus === "PICKED_UP" || assignmentStatus === "IN_TRANSIT" || assignmentStatus === "DELIVERED") {
    return true;
  }

  const status = `${row.core_status ?? ""} ${row.current_status ?? ""}`.toLowerCase();
  return (
    status.includes("picked_up") ||
    status.includes("pickedup") ||
    status.includes("ride_in_progress") ||
    status.includes("in_transit")
  );
}

function riderAcceptedDispatchedOffer(row: {
  accepted_at: string | null;
  assignment_status: string | null;
}): boolean {
  if (row.accepted_at) return true;
  const assignmentStatus = String(row.assignment_status ?? "").trim().toUpperCase();
  return (
    assignmentStatus === "ACCEPTED" ||
    assignmentStatus === "REACHED_MERCHANT" ||
    assignmentStatus === "PICKED_UP" ||
    assignmentStatus === "IN_TRANSIT" ||
    assignmentStatus === "DELIVERED"
  );
}

/** @deprecated Use isOrderPickedUpAtCancellation for 3PL fault penalty paths. */
function hasRiderMarkedPickup(row: {
  assignment_picked_up_at: string | null;
  rider_picked_up_at: string | null;
  delivery_picked_up_at: string | null;
  actual_pickup_time: string | null;
  dispatched_at: string | null;
  core_status: string | null;
  current_status: string | null;
}): boolean {
  return isOrderPickedUpAtCancellation({
    ...row,
    assignment_status: null,
  });
}

const orderPickedUpCache = new Map<number, Promise<boolean>>();

async function isOrderPickedUpAtOrderLevel(orderCoreId: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql.unsafe<
    {
      core_status: string | null;
      current_status: string | null;
      rider_picked_up_at: string | null;
      actual_pickup_time: string | null;
      any_assignment_picked_up: string | null;
      any_delivery_picked_up: string | null;
    }[]
  >(
    `
      SELECT
        oc.status::text AS core_status,
        oc.current_status::text AS current_status,
        f.rider_picked_up_at::text,
        oc.actual_pickup_time::text,
        (
          SELECT ora.picked_up_at::text
          FROM order_rider_assignments ora
          WHERE ora.order_core_id = oc.id
             OR ora.order_id = oc.id
             OR ora.order_id_text = oc.order_id
             OR ora.order_id_text = oc.formatted_order_id
          ORDER BY ora.picked_up_at DESC NULLS LAST
          LIMIT 1
        ) AS any_assignment_picked_up,
        (
          SELECT da.picked_up_at::text
          FROM delivery_assignments da
          WHERE da.order_id = oc.order_id
          ORDER BY da.picked_up_at DESC NULLS LAST
          LIMIT 1
        ) AS any_delivery_picked_up
      FROM orders_core oc
      LEFT JOIN orders_food f ON f.order_id = oc.id
      WHERE oc.id = $1
      LIMIT 1
    `,
    [orderCoreId]
  );
  const row = rows[0];
  if (!row) return false;
  return isOrderPickedUpAtCancellation({
    assignment_picked_up_at: row.any_assignment_picked_up,
    rider_picked_up_at: row.rider_picked_up_at,
    delivery_picked_up_at: row.any_delivery_picked_up,
    actual_pickup_time: row.actual_pickup_time,
    core_status: row.core_status,
    current_status: row.current_status,
    assignment_status: null,
  });
}

function getOrderPickedUpAtOrderLevel(orderCoreId: number): Promise<boolean> {
  let pending = orderPickedUpCache.get(orderCoreId);
  if (!pending) {
    pending = isOrderPickedUpAtOrderLevel(orderCoreId);
    orderPickedUpCache.set(orderCoreId, pending);
  }
  return pending;
}

type PenaltyScenarioOrderRow = {
  rider_id: number | null;
  accepted_at: string | null;
  assigned_at: string | null;
  assignment_status: string | null;
  assignment_picked_up_at: string | null;
  rider_picked_up_at: string | null;
  delivery_picked_up_at: string | null;
  actual_pickup_time: string | null;
  dispatched_at: string | null;
  core_status: string | null;
  current_status: string | null;
};

async function loadThreePlPenaltyScenarioOrderRow(
  orderCoreId: number,
  riderId: number
): Promise<PenaltyScenarioOrderRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe<PenaltyScenarioOrderRow[]>(
    `
      SELECT
        $2::bigint AS rider_id,
        ora.accepted_at::text,
        ora.assigned_at::text,
        ora.assignment_status::text,
        ora.picked_up_at::text AS assignment_picked_up_at,
        CASE WHEN oc.rider_id = $2 THEN f.rider_picked_up_at::text END AS rider_picked_up_at,
        da.picked_up_at::text AS delivery_picked_up_at,
        CASE WHEN oc.rider_id = $2 THEN oc.actual_pickup_time::text END AS actual_pickup_time,
        CASE WHEN oc.rider_id = $2 THEN f.dispatched_at::text END AS dispatched_at,
        oc.status::text AS core_status,
        oc.current_status::text AS current_status
      FROM orders_core oc
      LEFT JOIN orders_food f ON f.order_id = oc.id
      LEFT JOIN LATERAL (
        SELECT picked_up_at, accepted_at, assigned_at, assignment_status
        FROM order_rider_assignments
        WHERE rider_id = $2
          AND (
            order_core_id = oc.id
            OR order_id = oc.id
            OR order_id_text = oc.order_id
            OR order_id_text = oc.formatted_order_id
          )
        ORDER BY assignment_sequence DESC NULLS LAST,
                 assigned_at DESC NULLS LAST,
                 created_at DESC
        LIMIT 1
      ) ora ON TRUE
      LEFT JOIN LATERAL (
        SELECT picked_up_at
        FROM delivery_assignments
        WHERE rider_id = $2
          AND order_id = oc.order_id
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      ) da ON TRUE
      WHERE oc.id = $1
        AND EXISTS (
          SELECT 1
          FROM order_rider_assignments ora_chk
          WHERE ora_chk.rider_id = $2
            AND (
              ora_chk.order_core_id = oc.id
              OR ora_chk.order_id = oc.id
              OR ora_chk.order_id_text = oc.order_id
              OR ora_chk.order_id_text = oc.formatted_order_id
            )
        )
      LIMIT 1
    `,
    [orderCoreId, riderId]
  );
  return rows[0] ?? null;
}

async function loadPenaltyScenarioOrderRow(
  orderCoreId: number,
  riderId: number
): Promise<PenaltyScenarioOrderRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe<PenaltyScenarioOrderRow[]>(
    `
      SELECT
        oc.rider_id,
        ora.accepted_at::text,
        ora.assigned_at::text,
        ora.assignment_status::text,
        ora.picked_up_at::text AS assignment_picked_up_at,
        f.rider_picked_up_at::text,
        da.picked_up_at::text AS delivery_picked_up_at,
        oc.actual_pickup_time::text,
        f.dispatched_at::text,
        oc.status::text AS core_status,
        oc.current_status::text AS current_status
      FROM orders_core oc
      LEFT JOIN orders_food f ON f.order_id = oc.id
      LEFT JOIN LATERAL (
        SELECT picked_up_at, accepted_at, assigned_at, assignment_status
        FROM order_rider_assignments
        WHERE rider_id = $2
          AND (
            order_core_id = oc.id
            OR order_id = oc.id
            OR order_id_text = oc.order_id
            OR order_id_text = oc.formatted_order_id
          )
        ORDER BY assignment_sequence DESC NULLS LAST,
                 assigned_at DESC NULLS LAST,
                 created_at DESC
        LIMIT 1
      ) ora ON TRUE
      LEFT JOIN LATERAL (
        SELECT picked_up_at
        FROM delivery_assignments
        WHERE rider_id = $2
          AND order_id = oc.order_id
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      ) da ON TRUE
      WHERE oc.id = $1
        AND oc.rider_id = $2
      LIMIT 1
    `,
    [orderCoreId, riderId]
  );
  const row = rows[0];
  if (!row || Number(row.rider_id) !== riderId) return null;
  return row;
}

/** 3PL Fault: order-level pickup decides scenario; selected rider need not have marked pickup. */
async function resolveThreePlFaultPenaltyScenario(
  orderCoreId: number,
  riderId: number
): Promise<RiderPenaltyScenarioCode | null> {
  const row = await loadThreePlPenaltyScenarioOrderRow(orderCoreId, riderId);
  if (!row) return null;

  if (await getOrderPickedUpAtOrderLevel(orderCoreId)) {
    return "AFTER_MARK_PICKUP";
  }

  if (!riderAcceptedDispatchedOffer(row)) return null;
  return "AFTER_ACCEPT_DISPATCH";
}

async function resolvePenaltyScenario(
  orderCoreId: number,
  riderId: number
): Promise<RiderPenaltyScenarioCode | null> {
  const row = await loadPenaltyScenarioOrderRow(orderCoreId, riderId);
  if (!row) return null;

  const dispatchAccepted = Boolean(row.accepted_at || row.assigned_at || row.rider_id === riderId);
  if (!dispatchAccepted) return null;

  if (hasRiderMarkedPickup(row)) return "AFTER_MARK_PICKUP";
  return "AFTER_ACCEPT_DISPATCH";
}

async function loadScenarioConfig(scenarioCode: RiderPenaltyScenarioCode) {
  const sql = getSql();
  const rows = await sql.unsafe<
    {
      is_enabled: boolean;
      flat_penalty_amount: string | null;
      ledger_title: string;
      ledger_description: string;
      penalty_title: string;
      amount_base: RiderPenaltyAmountBase | null;
    }[]
  >(
    `
      SELECT
        is_enabled,
        flat_penalty_amount::text,
        ledger_title,
        ledger_description,
        penalty_title,
        amount_base
      FROM gm_rider_penalty_scenario_config
      WHERE scenario_code = $1::gm_rider_penalty_scenario_code
      LIMIT 1
    `,
    [scenarioCode]
  );
  return rows[0] ?? null;
}

async function reasonAppliesPenalty(
  scenarioCode: RiderPenaltyScenarioCode,
  catalogReasonId: number
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql.unsafe<{ applies_penalty: boolean }[]>(
    `
      SELECT BOOL_OR(r.applies_penalty) AS applies_penalty
      FROM order_cancellation_reason_catalog target
      INNER JOIN order_cancellation_reason_catalog c
        ON upper(trim(c.attribute)) = upper(trim(target.attribute))
       AND lower(trim(c.label)) = lower(trim(target.label))
      INNER JOIN gm_rider_penalty_reason_rules r
        ON r.catalog_reason_id = c.id
       AND r.scenario_code = $1::gm_rider_penalty_scenario_code
      WHERE target.id = $2
    `,
    [scenarioCode, catalogReasonId]
  );
  return Boolean(rows[0]?.applies_penalty);
}

async function isRiderPenaltyPanelEnabled(): Promise<boolean> {
  const sql = getSql();
  const rows = await sql.unsafe<{ is_enabled: boolean }[]>(`
    SELECT is_enabled
    FROM gm_party_penalty_panel
    WHERE party_code = 'RIDER'::gm_penalty_party_code
    LIMIT 1
  `);
  return rows[0]?.is_enabled !== false;
}

async function resolvePenaltyAmount(args: {
  orderCoreId: number;
  scenarioCode: RiderPenaltyScenarioCode;
  flatPenaltyAmount: number | null;
  amountBase: RiderPenaltyAmountBase | null;
}): Promise<number> {
  if (args.scenarioCode === "AFTER_ACCEPT_DISPATCH") {
    return round2(Math.max(0, Number(args.flatPenaltyAmount ?? 0)));
  }

  const sql = getSql();
  const rows = await sql.unsafe<
    {
      grand_total: string | null;
      rider_earning: string | null;
      fare_amount: string | null;
      billing_snapshot: unknown;
    }[]
  >(
    `
      SELECT
        grand_total::text,
        rider_earning::text,
        fare_amount::text,
        billing_snapshot
      FROM orders_core
      WHERE id = $1
      LIMIT 1
    `,
    [args.orderCoreId]
  );
  const core = rows[0];
  if (!core) return 0;

  if (args.amountBase === "COMPLETE_ORDER_VALUE") {
    const grand = Number(core.grand_total ?? 0);
    return round2(Math.max(0, Number.isFinite(grand) ? grand : 0));
  }

  const deliveryFee = resolveRiderDeliveryFeeFromCore({
    riderEarning: core.rider_earning,
    fareAmount: core.fare_amount,
    billingSnapshot: core.billing_snapshot,
  });
  return round2(Math.max(0, deliveryFee));
}

async function ledgerRefExists(riderId: number, ref: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql.unsafe<{ ok: number }[]>(
    `
      SELECT 1 AS ok
      FROM wallet_ledger
      WHERE rider_id = $1 AND ref = $2
      LIMIT 1
    `,
    [riderId, ref]
  );
  return rows.length > 0;
}

async function updateCancellationReasonPenalty(
  cancellationReasonId: number,
  amount: number
): Promise<void> {
  const sql = getSql();
  await sql.unsafe(
    `
      UPDATE order_cancellation_reasons
      SET
        penalty_applied = TRUE,
        penalty_amount = $2::numeric
      WHERE id = $1
    `,
    [cancellationReasonId, amount]
  );
}

async function fetchOrderPublicId(orderCoreId: number): Promise<string | null> {
  const sql = getSql();
  const rows = await sql.unsafe<{ formatted_order_id: string | null; order_id: string | null }[]>(
    `
      SELECT formatted_order_id, order_id
      FROM orders_core
      WHERE id = $1
      LIMIT 1
    `,
    [orderCoreId]
  );
  const row = rows[0];
  const formatted = row?.formatted_order_id?.trim();
  if (formatted) return formatted;
  const business = row?.order_id?.trim();
  if (business && !/^\d+$/.test(business)) return business;
  return null;
}

async function debitRiderWalletPenalty(args: {
  riderId: number;
  orderCoreId: number;
  amount: number;
  ledgerTitle: string;
  ledgerDescription: string;
  ledgerRef: string;
  scenarioCode?: RiderPenaltyScenarioCode;
  catalogReasonId: number;
  actorSystemUserId?: number | null;
  source: ApplyRiderCancellationPenaltyInput["source"];
  triggerSource?: string;
}): Promise<number> {
  const db = getDb();
  const amount = round2(args.amount);
  if (!(amount > 0)) {
    throw new Error("Penalty amount must be positive");
  }

  const [rider] = await db.select().from(riders).where(eq(riders.id, args.riderId)).limit(1);
  if (!rider) {
    throw new Error("Rider not found");
  }

  let [wallet] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, args.riderId)).limit(1);
  if (!wallet) {
    await db.insert(riderWallet).values({
      riderId: args.riderId,
      totalBalance: "0",
      earningsFood: "0",
      earningsParcel: "0",
      earningsPersonRide: "0",
      penaltiesFood: "0",
      penaltiesParcel: "0",
      penaltiesPersonRide: "0",
      totalWithdrawn: "0",
    });
    [wallet] = await db.select().from(riderWallet).where(eq(riderWallet.riderId, args.riderId)).limit(1);
  }

  const currentBalance = wallet ? Number(wallet.totalBalance) : 0;
  const balanceAfter = round2(currentBalance - amount);
  const newBalance = balanceAfter;
  let negativeUsedDelta = 0;
  if (newBalance < 0) {
    if (currentBalance >= 0) {
      negativeUsedDelta = amount - currentBalance;
    } else {
      negativeUsedDelta = amount;
    }
  }

  const serviceTypeForWallet = "food" as const;
  const reasonText =
    args.ledgerTitle.trim() ||
    (args.scenarioCode === "AFTER_MARK_PICKUP"
      ? "Order cancelled after pickup"
      : args.scenarioCode === "AFTER_ACCEPT_DISPATCH"
        ? "Ride cancelled after dispatch"
        : "Order cancellation penalty");
  const orderPublicId = await fetchOrderPublicId(args.orderCoreId);

  const [penalty] = await db
    .insert(riderPenalties)
    .values({
      riderId: args.riderId,
      serviceType: serviceTypeForWallet,
      penaltyType: "cancellation",
      amount: amount.toFixed(2),
      reason: reasonText,
      status: "active",
      orderId: args.orderCoreId,
      imposedBy: args.actorSystemUserId ?? null,
      source: "system",
      metadata: {
        rider_cancellation_penalty_engine: Boolean(args.scenarioCode),
        financial_rule_engine: args.triggerSource === "financial_rule_engine",
        scenarioCode: args.scenarioCode ?? null,
        catalogReasonId: args.catalogReasonId,
        ledgerDescription: args.ledgerDescription,
        triggerSource: args.triggerSource ?? args.source,
      },
    })
    .returning();

  await db.insert(walletLedger).values({
    riderId: args.riderId,
    entryType: "penalty",
    amount: amount.toFixed(2),
    balance: balanceAfter.toFixed(2),
    serviceType: serviceTypeForWallet,
    ref: args.ledgerRef,
    refType: "penalty",
    description: reasonText,
    metadata: {
      orderId: args.orderCoreId,
      orderPublicId,
      scenarioCode: args.scenarioCode ?? null,
      catalogReasonId: args.catalogReasonId,
      ledgerDescription: args.ledgerDescription,
      penaltyId: penalty.id,
      financialRuleEngine: args.triggerSource === "financial_rule_engine",
    },
    performedByType: "system",
    performedById: args.actorSystemUserId ?? null,
  });

  const pf = Number(wallet?.penaltiesFood ?? 0);
  await db
    .update(riderWallet)
    .set({
      penaltiesFood: (pf + amount).toFixed(2),
      negativeUsedFood: (
        Number((wallet as { negativeUsedFood?: string })?.negativeUsedFood ?? 0) +
        negativeUsedDelta
      ).toFixed(2),
      totalBalance: balanceAfter.toFixed(2),
      lastUpdatedAt: new Date(),
    })
    .where(eq(riderWallet.riderId, args.riderId));

  await syncNegativeWalletBlocks(args.riderId);
  return penalty.id;
}

async function applyFmreRiderPenaltyIfDue(
  input: ApplyRiderCancellationPenaltyInput
): Promise<ApplyRiderCancellationPenaltyResult | null> {
  const fmre = extractFmreRiderPenalty(input.engineRaw);
  if (!fmre.engineApplied || !(fmre.penalty > 0) || !fmre.walletDebit) {
    return null;
  }

  const faultIs3pl = isThreePlFault(input);
  const adminCancelWithoutRefund = input.refundType === "cancel_without_refund";
  if (!faultIs3pl && !adminCancelWithoutRefund) {
    return null;
  }

  const ledgerRef = fmreRiderPenaltyLedgerRef(input.orderCoreId, input.engineRaw ?? {});
  if (await ledgerRefExists(input.riderId, ledgerRef)) {
    return { applied: false, skipped: "already_applied" };
  }

  const title =
    fmre.ruleCode != null
      ? `Order cancel penalty (${fmre.ruleCode})`
      : "Order cancel penalty";

  const penaltyId = await debitRiderWalletPenalty({
    riderId: input.riderId,
    orderCoreId: input.orderCoreId,
    amount: fmre.penalty,
    ledgerTitle: title,
    ledgerDescription:
      "Penalty debited per Financial Rule Engine after admin order cancellation.",
    ledgerRef,
    catalogReasonId: input.catalogReasonId > 0 ? input.catalogReasonId : 0,
    actorSystemUserId: input.actorSystemUserId,
    source: input.source,
    triggerSource: "financial_rule_engine",
  });

  if (input.cancellationReasonId != null && input.cancellationReasonId > 0) {
    await updateCancellationReasonPenalty(input.cancellationReasonId, fmre.penalty);
  }

  return {
    applied: true,
    amount: fmre.penalty,
    penaltyId,
    ledgerTitle: title,
    scenarioCode: undefined,
  };
}

export async function applyRiderCancellationPenalty(
  input: ApplyRiderCancellationPenaltyInput
): Promise<ApplyRiderCancellationPenaltyResult> {
  if (!Number.isFinite(input.orderCoreId) || input.orderCoreId <= 0) {
    return { applied: false, skipped: "invalid_order" };
  }
  if (!Number.isFinite(input.riderId) || input.riderId <= 0) {
    return { applied: false, skipped: "invalid_rider" };
  }
  if (!Number.isFinite(input.riderId) || input.riderId <= 0) {
    return { applied: false, skipped: "invalid_rider" };
  }

  const faultIs3pl = isThreePlFault(input);
  const adminCancelWithoutRefund = input.refundType === "cancel_without_refund";

  if (!faultIs3pl && !adminCancelWithoutRefund) {
    return { applied: false, skipped: "not_3pl_fault" };
  }

  if (
    !faultIs3pl &&
    (!Number.isFinite(input.catalogReasonId) || input.catalogReasonId <= 0)
  ) {
    return { applied: false, skipped: "invalid_catalog_reason" };
  }

  try {
    if (!faultIs3pl) {
      const fmreApplied = await applyFmreRiderPenaltyIfDue(input);
      if (fmreApplied?.applied) return fmreApplied;
    }

    if (!(await isRiderPenaltyPanelEnabled())) {
      return { applied: false, skipped: "rider_penalty_panel_disabled" };
    }

    const scenarioCode = faultIs3pl
      ? await resolveThreePlFaultPenaltyScenario(input.orderCoreId, input.riderId)
      : await resolvePenaltyScenario(input.orderCoreId, input.riderId);
    if (!scenarioCode) {
      return { applied: false, skipped: "rider_not_accepted" };
    }

    const scenario = await loadScenarioConfig(scenarioCode);
    if (!scenario?.is_enabled) {
      return { applied: false, skipped: "scenario_disabled" };
    }

    const reasonOk =
      faultIs3pl ||
      input.skipReasonPenaltyCheck === true ||
      (Number.isFinite(input.catalogReasonId) &&
        input.catalogReasonId > 0 &&
        (await reasonAppliesPenalty(scenarioCode, input.catalogReasonId)));
    if (!reasonOk) {
      return { applied: false, skipped: "reason_penalty_disabled" };
    }

    const ledgerRef = penaltyLedgerRef(input.orderCoreId, input.riderId, scenarioCode);
    if (await ledgerRefExists(input.riderId, ledgerRef)) {
      return { applied: false, skipped: "already_applied" };
    }

    const flatAmount =
      scenario.flat_penalty_amount != null ? Number(scenario.flat_penalty_amount) : 0;
    const amount = await resolvePenaltyAmount({
      orderCoreId: input.orderCoreId,
      scenarioCode,
      flatPenaltyAmount: Number.isFinite(flatAmount) ? flatAmount : 0,
      amountBase: scenario.amount_base,
    });

    if (!(amount > 0)) {
      return { applied: false, skipped: "zero_penalty_amount" };
    }

    const ledgerTitle =
      scenarioCode === "AFTER_MARK_PICKUP"
        ? scenario.penalty_title || scenario.ledger_title
        : scenario.ledger_title;

    const penaltyId = await debitRiderWalletPenalty({
      riderId: input.riderId,
      orderCoreId: input.orderCoreId,
      amount,
      ledgerTitle,
      ledgerDescription: scenario.ledger_description,
      ledgerRef,
      scenarioCode,
      catalogReasonId: input.catalogReasonId > 0 ? input.catalogReasonId : 0,
      actorSystemUserId: input.actorSystemUserId,
      source: input.source,
      triggerSource: "rider_cancellation_penalty_engine",
    });

    if (input.cancellationReasonId != null && input.cancellationReasonId > 0) {
      await updateCancellationReasonPenalty(input.cancellationReasonId, amount);
    }

    void (async () => {
      try {
        const { backendFetch } = await import("@/lib/notif-backend");
        await backendFetch("/v1/internal/rider-account-notify", {
          method: "POST",
          body: {
            type: "penalty",
            riderId: input.riderId,
            amount,
            reason: ledgerTitle || scenario.ledger_description || "Cancellation penalty",
            orderId: input.orderCoreId,
            penaltyId,
          },
        });
      } catch (err) {
        console.warn("[applyRiderCancellationPenalty] push notify failed", err);
      }
    })();

    return {
      applied: true,
      scenarioCode,
      amount,
      penaltyId,
      ledgerTitle,
    };
  } catch (e) {
    if (isRelationMissingError(e)) {
      return { applied: false, skipped: "penalty_engine_not_migrated" };
    }
    console.error("[applyRiderCancellationPenalty]", e);
    throw e;
  }
}

export type ThreePlRiderPenaltyPreview = {
  appliesPenalty: boolean;
  penaltyAmount: number;
  scenarioCode: RiderPenaltyScenarioCode | null;
  scenarioLabel: string | null;
  ledgerTitle: string;
  ledgerDescription: string;
  skipped?: string;
  skippedLabel?: string;
};

const SCENARIO_LABELS: Record<RiderPenaltyScenarioCode, string> = {
  AFTER_ACCEPT_DISPATCH: "Cancellation after accept offer (before pickup)",
  AFTER_MARK_PICKUP: "Cancellation after order marked picked up",
};

const SKIPPED_LABELS: Record<string, string> = {
  rider_not_on_order: "This rider was not assigned to the order.",
  rider_not_accepted: "This rider did not accept the dispatch offer.",
  scenario_disabled: "This penalty scenario is disabled in Super Admin.",
  zero_penalty_amount: "Penalty amount is not configured.",
  rider_penalty_panel_disabled: "Rider penalty panel is disabled.",
  penalty_engine_not_migrated: "Rider penalty engine is not set up yet.",
  already_applied: "Penalty was already applied for this order.",
};

export async function previewThreePlRiderCancellationPenalty(args: {
  orderCoreId: number;
  riderId: number;
}): Promise<ThreePlRiderPenaltyPreview> {
  const empty: ThreePlRiderPenaltyPreview = {
    appliesPenalty: false,
    penaltyAmount: 0,
    scenarioCode: null,
    scenarioLabel: null,
    ledgerTitle: "",
    ledgerDescription: "",
  };

  if (!Number.isFinite(args.orderCoreId) || args.orderCoreId <= 0) {
    return { ...empty, skipped: "invalid_order", skippedLabel: "Invalid order." };
  }
  if (!Number.isFinite(args.riderId) || args.riderId <= 0) {
    return { ...empty, skipped: "invalid_rider", skippedLabel: "Select a rider." };
  }

  try {
    const row = await loadThreePlPenaltyScenarioOrderRow(args.orderCoreId, args.riderId);
    if (!row) {
      return {
        ...empty,
        skipped: "rider_not_on_order",
        skippedLabel: SKIPPED_LABELS.rider_not_on_order,
      };
    }

    if (!(await isRiderPenaltyPanelEnabled())) {
      return {
        ...empty,
        skipped: "rider_penalty_panel_disabled",
        skippedLabel: SKIPPED_LABELS.rider_penalty_panel_disabled,
      };
    }

    const scenarioCode = await resolveThreePlFaultPenaltyScenario(args.orderCoreId, args.riderId);
    if (!scenarioCode) {
      return {
        ...empty,
        skipped: "rider_not_accepted",
        skippedLabel: SKIPPED_LABELS.rider_not_accepted,
      };
    }

    const scenario = await loadScenarioConfig(scenarioCode);
    if (!scenario?.is_enabled) {
      return {
        ...empty,
        scenarioCode,
        scenarioLabel: SCENARIO_LABELS[scenarioCode],
        ledgerTitle: scenario?.ledger_title ?? "",
        ledgerDescription: scenario?.ledger_description ?? "",
        skipped: "scenario_disabled",
        skippedLabel: SKIPPED_LABELS.scenario_disabled,
      };
    }

    const flatAmount =
      scenario.flat_penalty_amount != null ? Number(scenario.flat_penalty_amount) : 0;
    const penaltyAmount = await resolvePenaltyAmount({
      orderCoreId: args.orderCoreId,
      scenarioCode,
      flatPenaltyAmount: Number.isFinite(flatAmount) ? flatAmount : 0,
      amountBase: scenario.amount_base,
    });

    const ledgerTitle =
      scenarioCode === "AFTER_MARK_PICKUP"
        ? scenario.penalty_title || scenario.ledger_title
        : scenario.ledger_title;

    if (!(penaltyAmount > 0)) {
      return {
        appliesPenalty: false,
        penaltyAmount: 0,
        scenarioCode,
        scenarioLabel: SCENARIO_LABELS[scenarioCode],
        ledgerTitle,
        ledgerDescription: scenario.ledger_description,
        skipped: "zero_penalty_amount",
        skippedLabel: SKIPPED_LABELS.zero_penalty_amount,
      };
    }

    return {
      appliesPenalty: true,
      penaltyAmount,
      scenarioCode,
      scenarioLabel: SCENARIO_LABELS[scenarioCode],
      ledgerTitle,
      ledgerDescription: scenario.ledger_description,
    };
  } catch (e) {
    if (isRelationMissingError(e)) {
      return {
        ...empty,
        skipped: "penalty_engine_not_migrated",
        skippedLabel: SKIPPED_LABELS.penalty_engine_not_migrated,
      };
    }
    throw e;
  }
}

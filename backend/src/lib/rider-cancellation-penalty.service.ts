import { and, eq, sql } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { riders, riderPenalties, riderWallet, walletLedger } from "../db/schema.js";
import {
  resolveCompleteOrderValuePaidByCustomer,
  resolveDeliveryFarePaidToRider,
} from "./rider-fare-basis.js";
import { syncNegativeWalletBlocks } from "./rider-negative-wallet-blocks.js";

export type RiderPenaltyScenarioCode = "AFTER_ACCEPT_DISPATCH" | "AFTER_MARK_PICKUP";
export type RiderPenaltyAmountBase = "DELIVERY_FARE" | "COMPLETE_ORDER_VALUE";

export type RiderCancellationPenaltyPreview = {
  appliesPenalty: boolean;
  penaltyAmount: number;
  ledgerTitle: string;
  ledgerDescription: string;
  scenarioCode: RiderPenaltyScenarioCode | null;
  catalogReasonId: number | null;
  reasonLabel: string | null;
  skipped?: string;
};

export type ApplyRiderAppCancellationPenaltyResult = {
  applied: boolean;
  skipped?: string;
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
    if (o.code === "42P01" || o.code === "42703") return true;
    if (typeof o.message === "string" && /relation .* does not exist|column .* does not exist/i.test(o.message)) {
      return true;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /relation .* does not exist|column .* does not exist/i.test(msg);
}

function penaltyLedgerRef(
  orderCoreId: number,
  riderId: number,
  scenarioCode: RiderPenaltyScenarioCode
): string {
  return `rider_cancel_pen:${orderCoreId}:${riderId}:${scenarioCode}`;
}

async function fetchOrderPublicId(orderCoreId: number): Promise<string | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      NULLIF(TRIM(oc.formatted_order_id), '') AS formatted_order_id,
      NULLIF(TRIM(f.formatted_order_id), '') AS food_formatted_order_id,
      NULLIF(TRIM(oc.order_id), '') AS order_id
    FROM orders_core oc
    LEFT JOIN orders_food f ON f.order_id = oc.id
    WHERE oc.id = ${orderCoreId}
    LIMIT 1
  `;
  const row = rows[0] as {
    formatted_order_id?: string | null;
    food_formatted_order_id?: string | null;
    order_id?: string | null;
  } | undefined;
  const formatted = row?.formatted_order_id?.trim();
  if (formatted) return formatted;
  const foodFormatted = row?.food_formatted_order_id?.trim();
  if (foodFormatted) return foodFormatted;
  const business = row?.order_id?.trim();
  if (business && !/^\d+$/.test(business)) return business;
  return null;
}

function normalizeOrderRef(ref: string): string {
  return ref.trim().replace(/^#+/, "");
}

function walletServiceKey(orderType: string): "food" | "parcel" | "person_ride" {
  const t = orderType.trim().toLowerCase();
  if (t === "person_ride" || t === "ride") return "person_ride";
  if (t === "parcel") return "parcel";
  return "food";
}

async function resolveCatalogReason(reasonCode: string): Promise<{
  id: number;
  label: string;
  attribute: string;
} | null> {
  const sql = getSql();
  const code = reasonCode.trim();
  if (!code) return null;

  try {
    const rows = await sql.unsafe<{ id: number; label: string; attribute: string }[]>(
      `
        SELECT id, label, attribute
        FROM order_cancellation_reason_catalog
        WHERE reason_code = $1
          AND channel = 'app'
          AND is_active = TRUE
        LIMIT 1
      `,
      [code]
    );
    if (rows[0]) return rows[0];
  } catch (e) {
    if (!isRelationMissingError(e)) throw e;
  }

  const legacy = await sql.unsafe<{ id: number; label: string; attribute: string }[]>(
    `
      SELECT id, label, attribute
      FROM order_cancellation_reason_catalog
      WHERE reason_code = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [code]
  );
  return legacy[0] ?? null;
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
  if (
    assignmentStatus === "PICKED_UP" ||
    assignmentStatus === "IN_TRANSIT" ||
    assignmentStatus === "DELIVERED"
  ) {
    return true;
  }

  const status = `${row.core_status ?? ""} ${row.current_status ?? ""}`.toLowerCase();
  return (
    status.includes("picked_up") ||
    status.includes("ride_in_progress") ||
    status.includes("in_transit")
  );
}

function hasRiderMarkedPickup(row: {
  assignment_picked_up_at: string | null;
  rider_picked_up_at: string | null;
  delivery_picked_up_at: string | null;
  actual_pickup_time: string | null;
  dispatched_at: string | null;
  core_status: string | null;
  current_status: string | null;
  assignment_status?: string | null;
}): boolean {
  return isOrderPickedUpAtCancellation({
    assignment_picked_up_at: row.assignment_picked_up_at,
    rider_picked_up_at: row.rider_picked_up_at,
    delivery_picked_up_at: row.delivery_picked_up_at,
    actual_pickup_time: row.actual_pickup_time,
    core_status: row.core_status,
    current_status: row.current_status,
    assignment_status: row.assignment_status ?? null,
  });
}

async function resolvePenaltyScenario(
  orderCoreId: number,
  riderId: number
): Promise<RiderPenaltyScenarioCode | null> {
  const sql = getSql();
  const rows = await sql.unsafe<
    {
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
    }[]
  >(
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

/** Penalty toggles are shared across web/app catalog rows with the same attribute + label. */
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
  try {
    const rows = await sql.unsafe<{ is_enabled: boolean }[]>(`
      SELECT is_enabled
      FROM gm_party_penalty_panel
      WHERE party_code = 'RIDER'::gm_penalty_party_code
      LIMIT 1
    `);
    return rows[0]?.is_enabled !== false;
  } catch (e) {
    if (isRelationMissingError(e)) return false;
    throw e;
  }
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
      checkout_metadata: unknown;
    }[]
  >(
    `
      SELECT
        grand_total::text,
        rider_earning::text,
        fare_amount::text,
        billing_snapshot,
        checkout_metadata
      FROM orders_core
      WHERE id = $1
      LIMIT 1
    `,
    [args.orderCoreId]
  );
  const core = rows[0];
  if (!core) return 0;

  const billingSnap = core.billing_snapshot ?? core.checkout_metadata;
  const normalizedBase = String(args.amountBase ?? "")
    .trim()
    .toUpperCase();

  // Financial Rule Engine: COMPLETE_ORDER_VALUE = customer CTC (cashin + GatiCash).
  if (normalizedBase === "COMPLETE_ORDER_VALUE" || normalizedBase === "CTC") {
    return resolveCompleteOrderValuePaidByCustomer({
      grandTotal: core.grand_total,
      billingSnapshot: billingSnap,
    });
  }

  const fromBilling = resolveDeliveryFarePaidToRider({
    riderEarning: core.rider_earning,
    fareAmount: core.fare_amount,
    billingSnapshot: core.billing_snapshot,
  });
  if (fromBilling > 0) return fromBilling;

  return resolveDeliveryFarePaidToRider({
    riderEarning: core.rider_earning,
    fareAmount: core.fare_amount,
    billingSnapshot: core.checkout_metadata,
  });
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

async function resolveOrderCoreForRider(
  riderId: number,
  orderRef: string
): Promise<{ orderCoreId: number; orderType: string } | null> {
  const sql = getSql();
  const ref = normalizeOrderRef(orderRef);
  if (!ref) return null;

  const rows = await sql.unsafe<{ id: number; order_type: string }[]>(
    `
      SELECT oc.id, oc.order_type
      FROM orders_core oc
      LEFT JOIN orders_food f ON f.order_id = oc.id
      WHERE oc.rider_id = $1
        AND (
          oc.id::text = $2
          OR oc.order_id = $2
          OR oc.formatted_order_id = $2
          OR f.formatted_order_id = $2
        )
      ORDER BY oc.updated_at DESC NULLS LAST, oc.id DESC
      LIMIT 1
    `,
    [riderId, ref]
  );
  if (rows[0]?.id) {
    return {
      orderCoreId: Number(rows[0].id),
      orderType: String(rows[0].order_type ?? "food"),
    };
  }

  if (/^\d+$/.test(ref)) {
    const pk = Number.parseInt(ref, 10);
    const byPk = await sql.unsafe<{ id: number; order_type: string }[]>(
      `
        SELECT id, order_type
        FROM orders_core
        WHERE rider_id = $1 AND id = $2
        LIMIT 1
      `,
      [riderId, pk]
    );
    if (byPk[0]?.id) {
      return {
        orderCoreId: Number(byPk[0].id),
        orderType: String(byPk[0].order_type ?? "food"),
      };
    }
  }

  const assigned = await sql.unsafe<{ id: number; order_type: string }[]>(
    `
      SELECT oc.id, oc.order_type
      FROM order_rider_assignments ora
      INNER JOIN orders_core oc ON oc.id = ora.order_core_id
      LEFT JOIN orders_food f ON f.order_id = oc.id
      WHERE ora.rider_id = $1
        AND ora.is_active = TRUE
        AND (
          oc.id::text = $2
          OR oc.order_id = $2
          OR oc.formatted_order_id = $2
          OR ora.order_id_text = $2
          OR f.formatted_order_id = $2
        )
      ORDER BY ora.assigned_at DESC NULLS LAST, ora.id DESC
      LIMIT 1
    `,
    [riderId, ref]
  );
  const assignedRow = assigned[0];
  if (!assignedRow?.id) return null;
  return {
    orderCoreId: Number(assignedRow.id),
    orderType: String(assignedRow.order_type ?? "food"),
  };
}

export async function previewRiderAppCancellationPenalty(args: {
  riderId: number;
  orderRef?: string;
  orderCoreId?: number;
  orderType?: string;
  reasonCode: string;
}): Promise<RiderCancellationPenaltyPreview> {
  const empty: RiderCancellationPenaltyPreview = {
    appliesPenalty: false,
    penaltyAmount: 0,
    ledgerTitle: "",
    ledgerDescription: "",
    scenarioCode: null,
    catalogReasonId: null,
    reasonLabel: null,
  };

  try {
    let orderCoreId = args.orderCoreId;
    let orderType = args.orderType ?? "food";

    if (orderCoreId == null && args.orderRef) {
      const order = await resolveOrderCoreForRider(args.riderId, args.orderRef);
      if (!order) return { ...empty, skipped: "order_not_found" };
      orderCoreId = order.orderCoreId;
      orderType = order.orderType;
    }

    if (orderCoreId == null || orderCoreId <= 0) {
      return { ...empty, skipped: "order_not_found" };
    }

    const catalog = await resolveCatalogReason(args.reasonCode);
    if (!catalog?.id) {
      return { ...empty, skipped: "catalog_reason_not_found", reasonLabel: args.reasonCode };
    }
    if (String(catalog.attribute).trim().toUpperCase() !== "RIDER") {
      return { ...empty, skipped: "not_rider_fault", catalogReasonId: catalog.id, reasonLabel: catalog.label };
    }

    if (!(await isRiderPenaltyPanelEnabled())) {
      return { ...empty, catalogReasonId: catalog.id, reasonLabel: catalog.label, skipped: "panel_disabled" };
    }

    const scenarioCode = await resolvePenaltyScenario(orderCoreId, args.riderId);
    if (!scenarioCode) {
      return { ...empty, catalogReasonId: catalog.id, reasonLabel: catalog.label, skipped: "not_accepted" };
    }

    const scenario = await loadScenarioConfig(scenarioCode);
    if (!scenario?.is_enabled) {
      return { ...empty, scenarioCode, catalogReasonId: catalog.id, reasonLabel: catalog.label, skipped: "scenario_disabled" };
    }

    const reasonPenaltyEnabled = await reasonAppliesPenalty(scenarioCode, catalog.id);
    if (!reasonPenaltyEnabled) {
      return {
        appliesPenalty: false,
        penaltyAmount: 0,
        ledgerTitle: scenario.ledger_title,
        ledgerDescription: scenario.ledger_description,
        scenarioCode,
        catalogReasonId: catalog.id,
        reasonLabel: catalog.label,
        skipped: "reason_penalty_disabled",
      };
    }

    const flatAmount =
      scenario.flat_penalty_amount != null ? Number(scenario.flat_penalty_amount) : 0;
    const penaltyAmount = await resolvePenaltyAmount({
      orderCoreId,
      scenarioCode,
      flatPenaltyAmount: Number.isFinite(flatAmount) ? flatAmount : 0,
      amountBase: scenario.amount_base,
    });

    const ledgerTitle =
      scenarioCode === "AFTER_MARK_PICKUP"
        ? scenario.penalty_title || scenario.ledger_title
        : scenario.ledger_title;

    return {
      appliesPenalty: true,
      penaltyAmount,
      ledgerTitle,
      ledgerDescription: scenario.ledger_description,
      scenarioCode,
      catalogReasonId: catalog.id,
      reasonLabel: catalog.label,
      ...(penaltyAmount <= 0 ? { skipped: "penalty_amount_unresolved" as const } : {}),
    };
  } catch (e) {
    if (isRelationMissingError(e)) {
      return { ...empty, skipped: "penalty_engine_not_migrated" };
    }
    throw e;
  }
}

async function debitRiderWalletPenalty(args: {
  riderId: number;
  orderCoreId: number;
  orderType: string;
  amount: number;
  ledgerTitle: string;
  ledgerDescription: string;
  scenarioCode: RiderPenaltyScenarioCode;
  catalogReasonId: number;
}): Promise<number> {
  const db = getDb();
  const amount = round2(args.amount);
  if (!(amount > 0)) throw new Error("Penalty amount must be positive");

  const penaltyId = await db.transaction(async (tx) => {
    const [rider] = await tx.select().from(riders).where(eq(riders.id, args.riderId)).limit(1);
    if (!rider) throw new Error("Rider not found");

    const locked = await tx.execute(
      sql`SELECT * FROM rider_wallet WHERE rider_id = ${args.riderId} FOR UPDATE`
    );
    let wallet = (locked as Record<string, unknown>[])[0] as
      | {
          total_balance?: string;
          penalties_food?: string;
          penalties_parcel?: string;
          penalties_person_ride?: string;
          negative_used_food?: string;
          negative_used_parcel?: string;
          negative_used_person_ride?: string;
        }
      | undefined;

    if (!wallet) {
      await tx.insert(riderWallet).values({
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
      const again = await tx.execute(
        sql`SELECT * FROM rider_wallet WHERE rider_id = ${args.riderId} FOR UPDATE`
      );
      wallet = (again as unknown as Array<NonNullable<typeof wallet>>)[0];
    }

    const service = walletServiceKey(args.orderType);
    const currentBalance = Number(wallet?.total_balance ?? 0);
    const balanceAfter = round2(currentBalance - amount);

    let negativeUsedDelta = 0;
    if (balanceAfter < 0) {
      negativeUsedDelta = currentBalance >= 0 ? amount - currentBalance : amount;
    }

    const ledgerRef = penaltyLedgerRef(args.orderCoreId, args.riderId, args.scenarioCode);
    const orderPublicId = await fetchOrderPublicId(args.orderCoreId);
    const reasonText =
      args.ledgerTitle.trim() ||
      (args.scenarioCode === "AFTER_MARK_PICKUP"
        ? "Order cancelled after pickup"
        : "Ride cancelled after dispatch");

    const [penalty] = await tx
      .insert(riderPenalties)
      .values({
        riderId: args.riderId,
        serviceType: service,
        penaltyType: "cancellation",
        amount: amount.toFixed(2),
        reason: reasonText,
        status: "active",
        orderId: args.orderCoreId,
        source: "system",
        metadata: {
          rider_cancellation_penalty_engine: true,
          scenarioCode: args.scenarioCode,
          catalogReasonId: args.catalogReasonId,
          ledgerDescription: args.ledgerDescription,
          triggerSource: "rider_app_cancel",
          orderPublicId: orderPublicId ?? undefined,
          orderId: args.orderCoreId,
        },
      })
      .returning();

    // Schema only models a subset of the wallet_ledger columns; serviceType /
    // performedByType / performedById exist in prod via later migrations not
    // yet folded into schema.ts. Cast to bypass TS check; runtime insert
    // succeeds because the columns exist in the table.
    await tx.insert(walletLedger).values({
      riderId: args.riderId,
      entryType: "penalty",
      amount: amount.toFixed(2),
      balance: balanceAfter.toFixed(2),
      serviceType: service,
      ref: ledgerRef,
      refType: "penalty",
      description: reasonText,
      metadata: {
        orderId: args.orderCoreId,
        orderPublicId,
        serviceType: service,
        scenarioCode: args.scenarioCode,
        catalogReasonId: args.catalogReasonId,
        ledgerDescription: args.ledgerDescription,
        penaltyId: penalty.id,
        triggerSource: "rider_app_cancel",
      },
      performedByType: "system",
      performedById: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const patch: Partial<typeof riderWallet.$inferInsert> = {
      totalBalance: balanceAfter.toFixed(2),
      lastUpdatedAt: new Date(),
    };
    if (service === "food") {
      patch.penaltiesFood = (Number(wallet?.penalties_food ?? 0) + amount).toFixed(2);
      patch.negativeUsedFood = (
        Number(wallet?.negative_used_food ?? 0) + negativeUsedDelta
      ).toFixed(2);
    } else if (service === "parcel") {
      patch.penaltiesParcel = (Number(wallet?.penalties_parcel ?? 0) + amount).toFixed(2);
      patch.negativeUsedParcel = (
        Number(wallet?.negative_used_parcel ?? 0) + negativeUsedDelta
      ).toFixed(2);
    } else {
      patch.penaltiesPersonRide = (Number(wallet?.penalties_person_ride ?? 0) + amount).toFixed(2);
      patch.negativeUsedPersonRide = (
        Number(wallet?.negative_used_person_ride ?? 0) + negativeUsedDelta
      ).toFixed(2);
    }

    await tx.update(riderWallet).set(patch).where(eq(riderWallet.riderId, args.riderId));
    return penalty.id;
  });

  await syncNegativeWalletBlocks(args.riderId);
  return penaltyId;
}

export async function applyRiderAppCancellationPenalty(args: {
  riderId: number;
  orderCoreId: number;
  orderType: string;
  reasonCode: string;
}): Promise<ApplyRiderAppCancellationPenaltyResult> {
  const preview = await previewRiderAppCancellationPenalty({
    riderId: args.riderId,
    orderCoreId: args.orderCoreId,
    orderType: args.orderType,
    reasonCode: args.reasonCode,
  });

  if (!preview.appliesPenalty || !(preview.penaltyAmount > 0)) {
    return { applied: false, skipped: preview.skipped ?? "no_penalty" };
  }
  if (!preview.scenarioCode || !preview.catalogReasonId) {
    return { applied: false, skipped: "invalid_preview" };
  }

  const ledgerRef = penaltyLedgerRef(args.orderCoreId, args.riderId, preview.scenarioCode);
  if (await ledgerRefExists(args.riderId, ledgerRef)) {
    return { applied: false, skipped: "already_applied" };
  }

  // One active penalty per order — do not stack a second debit that can be reverted again.
  const existingActive = await getDb()
    .select({ id: riderPenalties.id })
    .from(riderPenalties)
    .where(
      and(
        eq(riderPenalties.riderId, args.riderId),
        eq(riderPenalties.orderId, args.orderCoreId),
        sql`${riderPenalties.status} IS DISTINCT FROM 'reversed'`
      )
    )
    .limit(1);
  if (existingActive[0]) {
    return { applied: false, skipped: "already_applied" };
  }

  const penaltyId = await debitRiderWalletPenalty({
    riderId: args.riderId,
    orderCoreId: args.orderCoreId,
    orderType: args.orderType,
    amount: preview.penaltyAmount,
    ledgerTitle: preview.ledgerTitle,
    ledgerDescription: preview.ledgerDescription,
    scenarioCode: preview.scenarioCode,
    catalogReasonId: preview.catalogReasonId,
  });

  void import("./notify-rider-account.js")
    .then(({ notifyRiderPenaltyApplied }) =>
      notifyRiderPenaltyApplied({
        riderId: args.riderId,
        amount: preview.penaltyAmount,
        reason: preview.ledgerTitle || preview.ledgerDescription || "Cancellation penalty",
        orderId: args.orderCoreId,
        penaltyId,
      }),
    )
    .catch((err) => {
      console.warn("[rider-cancellation-penalty] push notify failed", err);
    });

  return {
    applied: true,
    amount: preview.penaltyAmount,
    penaltyId,
    ledgerTitle: preview.ledgerTitle,
  };
}

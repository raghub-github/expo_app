/**
 * Food orders dashboard tab stages (PAYMENT DONE → DESPATCHED + BULK).
 * Uses orders_core.status, current_status, and orders_food.order_status together.
 */

import { sql, type SQL } from "drizzle-orm";
import { ordersCore } from "../schema";

export type FoodDashboardStageFilter =
  | "PAYMENT DONE"
  | "ACCEPTED"
  | "DESPATCH READY"
  | "DESPATCHED"
  | "BULK"
  | null;

/** Normalized current_status: upper case, spaces/dashes → underscores. */
function sqlCurrentStatusKey(): SQL {
  return sql`upper(replace(replace(trim(coalesce(${ordersCore.currentStatus}, '')), ' ', '_'), '-', '_'))`;
}

function sqlCoreStatusKey(): SQL {
  return sql`lower(trim(coalesce(${ordersCore.status}::text, '')))`;
}

/** Normalized orders_food.order_status for the linked food row. */
function sqlLinkedFoodStatusKey(): SQL {
  return sql`(
    SELECT upper(replace(replace(trim(coalesce(of.order_status, '')), ' ', '_'), '-', '_'))
    FROM orders_food of
    WHERE of.order_id = ${ordersCore.id}
    ORDER BY of.id DESC
    LIMIT 1
  )`;
}

/** Delivered / cancelled / terminal — never shown on food orders dashboard tabs. */
export function sqlFoodOrderIsTerminal(): SQL {
  const cur = sqlCurrentStatusKey();
  const core = sqlCoreStatusKey();
  const food = sqlLinkedFoodStatusKey();
  return sql`(
    ${core} IN (
      'delivered', 'cancelled', 'failed', 'rejected',
      'rto_initiated', 'rto_in_transit', 'rto_delivered', 'rto_lost'
    )
    OR ${cur} IN (
      'DELIVERED', 'CANCELLED', 'CANCELED', 'RTO', 'REJECTED', 'FAILED',
      'RTO_INITIATED', 'RTO_IN_TRANSIT', 'RTO_DELIVERED', 'RTO_LOST'
    )
    OR ${food} IN ('DELIVERED', 'CANCELLED', 'CANCELED', 'RTO', 'REJECTED', 'FAILED')
    OR ${ordersCore.cancelledAt} IS NOT NULL
  )`;
}

const DISPATCHED_CUR = sql`(
  'OUT_FOR_DELIVERY', 'DISPATCHED', 'DESPATCHED', 'ON_THE_WAY', 'IN_TRANSIT', 'PICKED_UP'
)`;

const DISPATCHED_CORE = sql`('dispatched', 'in_transit')`;

const DISPATCH_READY_CUR = sql`(
  'READY_FOR_PICKUP', 'READY', 'DISPATCH_READY', 'DISPATCHREADY',
  'DISPATCH_READY_FOR_PICKUP', 'REACHED_STORE'
)`;

const DISPATCH_READY_CORE = sql`('dispatch_ready', 'reached_store')`;

const ACCEPTED_CUR = sql`('ACCEPTED', 'PREPARING')`;

const PAYMENT_DONE_CUR = sql`(
  'PLACED', 'CREATED', 'NEW', 'ORDER_PLACED', 'ORDER_RECEIVED',
  'PAYMENT_DONE', 'PYMT_ASSIGN_RX', 'BILL_READY', 'PAYMENT_INITIATED_AT',
  'PAYMENT_INITIATED', 'ASSIGNED'
)`;

const PAYMENT_DONE_CORE = sql`(
  'assigned', 'created', 'bill_ready', 'payment_initiated_at', 'payment_done', 'pymt_assign_rx'
)`;

function sqlIsDispatchedStage(): SQL {
  const cur = sqlCurrentStatusKey();
  const food = sqlLinkedFoodStatusKey();
  const core = sqlCoreStatusKey();
  return sql`(
    ${cur} IN ${DISPATCHED_CUR}
    OR ${food} IN ${DISPATCHED_CUR}
    OR ${core} IN ${DISPATCHED_CORE}
    OR (
      ${core} = 'picked_up'
      AND NOT (${cur} ILIKE 'DISPATCH%READY%' OR ${cur} IN ${DISPATCH_READY_CUR})
    )
  )`;
}

function sqlIsDispatchReadyStage(): SQL {
  const cur = sqlCurrentStatusKey();
  const food = sqlLinkedFoodStatusKey();
  const core = sqlCoreStatusKey();
  return sql`(
    ${cur} ILIKE 'DISPATCH%READY%'
    OR ${cur} IN ${DISPATCH_READY_CUR}
    OR ${food} IN ${DISPATCH_READY_CUR}
    OR ${core} IN ${DISPATCH_READY_CORE}
    OR (
      ${core} = 'picked_up'
      AND (${cur} ILIKE 'DISPATCH%READY%' OR ${cur} IN ${DISPATCH_READY_CUR})
    )
  )`;
}

function sqlIsAcceptedStage(): SQL {
  const cur = sqlCurrentStatusKey();
  const food = sqlLinkedFoodStatusKey();
  const core = sqlCoreStatusKey();
  return sql`(
    ${cur} IN ${ACCEPTED_CUR}
    OR ${food} IN ${ACCEPTED_CUR}
    OR ${core} = 'accepted'
  )`;
}

function sqlIsPaymentDoneStage(): SQL {
  const cur = sqlCurrentStatusKey();
  const food = sqlLinkedFoodStatusKey();
  const core = sqlCoreStatusKey();
  return sql`(
    ${core} IN ${PAYMENT_DONE_CORE}
    OR ${cur} IN ${PAYMENT_DONE_CUR}
    OR ${food} IN ('CREATED', 'PLACED', 'NEW', 'ORDER_PLACED')
    OR (${core} = 'assigned' AND ${cur} = '' AND COALESCE(${food}, '') IN ('', 'CREATED', 'PLACED', 'NEW'))
  )`;
}

/** Exclude delivered/cancelled; older pending orders remain visible. */
export function sqlFoodOrderActiveListScope(): SQL {
  return sql`NOT ${sqlFoodOrderIsTerminal()}`;
}

export function sqlFoodOrderDashboardStageFilter(statusFilter: FoodDashboardStageFilter): SQL | null {
  if (!statusFilter || statusFilter === "BULK") return null;

  if (statusFilter === "DESPATCHED") {
    return sqlIsDispatchedStage();
  }

  if (statusFilter === "DESPATCH READY") {
    return sql`(${sqlIsDispatchReadyStage()} AND NOT ${sqlIsDispatchedStage()})`;
  }

  if (statusFilter === "ACCEPTED") {
    return sql`(
      ${sqlIsAcceptedStage()}
      AND NOT ${sqlIsDispatchReadyStage()}
      AND NOT ${sqlIsDispatchedStage()}
    )`;
  }

  // PAYMENT DONE — before acceptance
  return sql`(
    ${sqlIsPaymentDoneStage()}
    AND NOT ${sqlIsAcceptedStage()}
    AND NOT ${sqlIsDispatchReadyStage()}
    AND NOT ${sqlIsDispatchedStage()}
  )`;
}

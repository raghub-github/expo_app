/**
 * Rider wait escalation — notify merchant at 5/10 min, admin at 15 min.
 */
import { getSql } from "../../db/client.js";
import { send as sendNotification } from "../notifications/notificationService.js";
import {
  lookupFoodOrderIdByCoreOrderText,
  merchantAppOrderHref,
} from "../../lib/merchant-new-order-notify.js";

type EscalationLevel = 1 | 2 | 3;

const LEVEL_THRESHOLDS: Record<EscalationLevel, number> = {
  1: 5,
  2: 10,
  3: 15,
};

const LEVEL_COPY: Record<EscalationLevel, { title: string; body: string; priority: string }> = {
  1: {
    title: "Rider waiting at store",
    body: "A delivery partner has been waiting 5+ minutes. Please mark the order ready.",
    priority: "normal",
  },
  2: {
    title: "Urgent: rider waiting",
    body: "Delivery partner has waited 10+ minutes. Mark order ready immediately.",
    priority: "high",
  },
  3: {
    title: "Admin alert: long rider wait",
    body: "Rider has waited 15+ minutes at store. Ops team notified.",
    priority: "critical",
  },
};

async function merchantTokensForStore(sql: ReturnType<typeof getSql>, storeId: number): Promise<string[]> {
  const rows = await sql<{ token: string }[]>`
    SELECT token
    FROM merchant_store_push_tokens
    WHERE store_id = ${storeId}
  `;
  return rows.map((r) => r.token).filter(Boolean);
}

async function recordEscalation(
  sql: ReturnType<typeof getSql>,
  args: {
    orderCoreId: number;
    orderIdText: string;
    merchantStoreId: number;
    riderId: number | null;
    waitMinutes: number;
    level: EscalationLevel;
  }
): Promise<boolean> {
  try {
    const inserted = await sql<{ id: number }[]>`
      INSERT INTO order_rider_wait_escalations (
        order_id, order_id_text, merchant_store_id, rider_id, wait_minutes, escalation_level
      ) VALUES (
        ${args.orderCoreId},
        ${args.orderIdText},
        ${args.merchantStoreId},
        ${args.riderId},
        ${args.waitMinutes},
        ${args.level}
      )
      ON CONFLICT (order_id, escalation_level) DO NOTHING
      RETURNING id
    `;
    return inserted.length > 0;
  } catch (e) {
    console.warn("[eta] recordEscalation failed", (e as Error).message);
    return false;
  }
}

async function notifyAdminEscalation(args: {
  orderIdText: string;
  merchantStoreId: number;
  riderId: number | null;
  waitMinutes: number;
}): Promise<void> {
  console.warn("[eta][admin-escalation] rider wait exceeded 15 min", {
    orderIdText: args.orderIdText,
    merchantStoreId: args.merchantStoreId,
    riderId: args.riderId,
    waitMinutes: args.waitMinutes,
    event: "RIDER_WAIT_ADMIN_ESCALATION",
  });
}

export async function processRiderWaitEscalations(args: {
  orderCoreId: number;
  orderIdText: string;
  merchantStoreId: number;
  riderId: number | null;
  riderWaitMinutes: number;
}): Promise<void> {
  if (args.riderWaitMinutes < LEVEL_THRESHOLDS[1]) return;

  const sql = getSql();
  const levels: EscalationLevel[] = [1, 2, 3];

  for (const level of levels) {
    if (args.riderWaitMinutes < LEVEL_THRESHOLDS[level]) continue;

    const isNew = await recordEscalation(sql, {
      orderCoreId: args.orderCoreId,
      orderIdText: args.orderIdText,
      merchantStoreId: args.merchantStoreId,
      riderId: args.riderId,
      waitMinutes: args.riderWaitMinutes,
      level,
    });
    if (!isNew) continue;

    if (level <= 2) {
      const copy = LEVEL_COPY[level];
      const tokens = await merchantTokensForStore(sql, args.merchantStoreId);
      if (tokens.length > 0) {
        const foodOrderId = await lookupFoodOrderIdByCoreOrderText(sql, {
          orderIdText: args.orderIdText,
          merchantStoreId: args.merchantStoreId,
        });
        const href = merchantAppOrderHref(foodOrderId);
        await sendNotification({
          templateCode: "MERCHANT_RIDER_WAIT_ESCALATION",
          variables: {
            orderId: foodOrderId ?? args.orderIdText,
            foodOrderId: foodOrderId ?? "",
            title: copy.title,
            body: copy.body,
            waitMinutes: args.riderWaitMinutes,
            escalationLevel: level,
          },
          target: { device_tokens: tokens },
          priority: level >= 2 ? "critical" : "high",
          metadata: {
            type: "merchant_rider_wait_priority",
            gmType: "RIDER_WAIT_ESCALATION",
            orderId: args.orderIdText,
            foodOrderId,
            url: href,
            escalationLevel: level,
          },
        }).catch((e) =>
          console.warn("[eta] merchant wait escalation push failed", (e as Error).message)
        );
      }
    } else {
      await notifyAdminEscalation({
        orderIdText: args.orderIdText,
        merchantStoreId: args.merchantStoreId,
        riderId: args.riderId,
        waitMinutes: args.riderWaitMinutes,
      });
    }
  }
}

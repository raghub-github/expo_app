/**
 * Internal endpoints for financial-rule-worker — outbox post-actions,
 * approval notifications, and ticket creation.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { getEnv } from "../../config/env.js";
import { getDb, getSql } from "../../db/client.js";
import {
  customers,
  enterpriseTickets,
  expoPushTokens,
  ordersCore,
  ticketMessages,
  ticketParticipants,
} from "../../db/schema.js";
import { enqueuePush } from "../push/enqueuePush.js";

const processEventBody = z.object({
  topic: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  outboxId: z.number().int().optional(),
});

const approvalNotifyBody = z.object({
  limit: z.number().int().positive().max(100).optional().default(25),
});

function generateTicketNumber(): string {
  return `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function tokensForRoles(roles: string[]): Promise<string[]> {
  if (roles.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ token: expoPushTokens.expoPushToken })
    .from(expoPushTokens)
    .where(inArray(expoPushTokens.role, roles));
  return rows.map((r) => r.token);
}

async function customerTokensForOrder(orderId: number): Promise<string[]> {
  const db = getDb();
  const [order] = await db
    .select({ customerId: ordersCore.customerId })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderId))
    .limit(1);
  if (!order?.customerId) return [];
  const [cust] = await db
    .select({ customerId: customers.customerId })
    .from(customers)
    .where(eq(customers.id, order.customerId))
    .limit(1);
  if (!cust?.customerId) return [];
  const rows = await db
    .select({ token: expoPushTokens.expoPushToken })
    .from(expoPushTokens)
    .where(eq(expoPushTokens.userId, cust.customerId));
  return rows.map((r) => r.token);
}

export async function financialRulesInternalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req, reply) => {
    const env = getEnv();
    const expected = env.INTERNAL_API_TOKEN ?? "";
    if (!expected) {
      return reply.code(503).send({ ok: false, error: "internal_token_not_configured" });
    }
    const given = String(req.headers["x-internal-token"] ?? "");
    if (given !== expected) {
      return reply.code(401).send({ ok: false, error: "invalid_internal_token" });
    }
  });

  app.post("/financial-rules/process-event", async (req, reply) => {
    const parsed = processEventBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    const { topic, payload } = parsed.data;
    const sql = getSql();

    if (topic === "financial_rule.executed") {
      const result = (payload.result ?? payload) as Record<string, unknown>;
      const orderIdRaw = payload.order_id ?? result.order_id;
      const orderId = orderIdRaw != null ? Number(orderIdRaw) : null;
      const execStatus = String(result.execution_status ?? "");
      const amounts = result.amounts as Record<string, unknown> | undefined;
      const refund = Number(amounts?.refund ?? 0);

      if (execStatus === "APPROVAL_REQUIRED") {
        const adminTokens = await tokensForRoles(["admin", "dashboard", "super_admin"]);
        if (adminTokens.length > 0) {
          await enqueuePush({
            to: adminTokens,
            title: "Financial rule approval required",
            body: `Order ${orderId ?? "unknown"} requires approval for ₹${refund.toFixed(2)} refund.`,
            data: {
              screen: "/dashboard/super-admin/rule-engine",
              tab: "approvals",
              execution_log_id: payload.execution_log_id,
            },
          });
        }
      } else if (refund > 0 && orderId != null && Number.isFinite(orderId)) {
        const customerTokens = await customerTokensForOrder(orderId);
        if (customerTokens.length > 0) {
          await enqueuePush({
            to: customerTokens,
            title: "Refund update",
            body: `₹${refund.toFixed(2)} refund has been initiated for your order.`,
            data: { order_id: orderId, execution_log_id: payload.execution_log_id },
          });
        }
      }

      return reply.send({ ok: true, handled: "executed" });
    }

    if (topic === "financial_rule.ticket_required") {
      const executionLogId = Number(payload.execution_log_id ?? 0);
      const ruleId = Number(payload.rule_id ?? 0);
      if (!executionLogId) {
        return reply.code(400).send({ ok: false, error: "missing_execution_log_id" });
      }

      const rows = await sql`
        SELECT e.order_id, e.core_order_id, e.scenario_type, e.applied_refund, m.rule_code
        FROM gm_rule_execution_log e
        LEFT JOIN gm_rule_master m ON m.id = e.rule_id
        WHERE e.id = ${executionLogId}
        LIMIT 1
      `;
      const exec = rows[0] as {
        order_id?: number;
        core_order_id?: string;
        scenario_type?: string;
        applied_refund?: unknown;
        rule_code?: string;
      } | undefined;

      const db = getDb();
      const ticketNumber = generateTicketNumber();
      const subject = `Financial rule review: ${exec?.rule_code ?? ruleId}`;
      const description =
        `Auto-ticket from Financial Rule Engine.\n` +
        `Execution #${executionLogId}\n` +
        `Scenario: ${exec?.scenario_type ?? "unknown"}\n` +
        `Order: ${exec?.core_order_id ?? exec?.order_id ?? "unknown"}\n` +
        `Refund amount: ₹${Number(exec?.applied_refund ?? 0).toFixed(2)}`;

      const [ticket] = await db
        .insert(enterpriseTickets)
        .values({
          ticketNumber,
          serviceType: "food",
          ticketCategory: "order_related",
          ticketSection: "system",
          sourceRole: "system",
          subject,
          description,
          status: "open",
          priority: "high",
          orderId: exec?.order_id ?? null,
        })
        .returning({ id: enterpriseTickets.id });

      if (ticket?.id) {
        await db.insert(ticketParticipants).values({
          ticketId: ticket.id,
          participantRole: "creator",
          entityType: "system",
        });
        await db.insert(ticketMessages).values({
          ticketId: ticket.id,
          senderType: "system",
          senderId: 0,
          messageType: "system",
          message: description,
        });
      }

      return reply.send({ ok: true, handled: "ticket_created", ticketId: ticket?.id });
    }

    if (topic === "financial_rule.approved") {
      const orderIdRaw = payload.order_id;
      const orderId = orderIdRaw != null ? Number(orderIdRaw) : null;
      const amount = Number(payload.amount ?? 0);
      if (orderId != null && Number.isFinite(orderId)) {
        const customerTokens = await customerTokensForOrder(orderId);
        if (customerTokens.length > 0) {
          await enqueuePush({
            to: customerTokens,
            title: "Refund approved",
            body: `Your refund of ₹${amount.toFixed(2)} has been approved.`,
            data: { order_id: orderId, execution_log_id: payload.execution_log_id },
          });
        }
      }
      return reply.send({ ok: true, handled: "approved" });
    }

    return reply.send({ ok: true, handled: "ignored", topic });
  });

  app.post("/financial-rules/notify-pending-approvals", async (req, reply) => {
    const parsed = approvalNotifyBody.safeParse(req.body ?? {});
    const limit = parsed.success ? parsed.data.limit : 25;
    const sql = getSql();

    const pending = await sql`
      SELECT a.id, a.amount, a.core_order_id, a.order_id, a.scenario_type, m.rule_code
      FROM gm_rule_pending_approvals a
      LEFT JOIN gm_rule_master m ON m.id = a.rule_id
      WHERE a.status = 'PENDING'
      ORDER BY a.created_at ASC
      LIMIT ${limit}
    `;

    const adminTokens = await tokensForRoles(["admin", "dashboard", "super_admin"]);
    let notified = 0;
    if (adminTokens.length > 0) {
      for (const row of pending as Array<Record<string, unknown>>) {
        await enqueuePush({
          to: adminTokens,
          title: "Pending financial approval",
          body: `${row.rule_code}: ₹${Number(row.amount ?? 0).toFixed(2)} for order ${row.core_order_id ?? row.order_id}`,
          data: { approval_id: row.id, screen: "/dashboard/super-admin/rule-engine", tab: "approvals" },
        }).catch(() => undefined);
        notified++;
      }
    }

    return reply.send({ ok: true, notified, pending: pending.length });
  });
}

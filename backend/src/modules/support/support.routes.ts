/**
 * Support tickets – customer app.
 * POST /v1/support/tickets (create), GET /v1/support/tickets (list), GET /v1/support/tickets/:id (get one).
 * Uses enterprise tickets + ticket_participants; customer_id from JWT resolved to customers.id.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import {
  customers,
  enterpriseTickets,
  ticketParticipants,
  ticketMessages,
} from "../../db/schema.js";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";

const createTicketBodySchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  ticket_title: z.string().max(200).optional(),
});

const ticketListItemSchema = z.object({
  id: z.number(),
  ticket_id: z.string(),
  subject: z.string(),
  description: z.string(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  created_at: z.string(),
  updated_at: z.string(),
  resolved_at: z.string().nullable().optional(),
});

const listResponseSchema = z.object({
  tickets: z.array(ticketListItemSchema),
  total: z.number().optional(),
});

const createResponseSchema = z.object({
  id: z.number(),
  ticket_id: z.string(),
});

/** Map DB status to app status */
function toAppStatus(dbStatus: string): "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" {
  switch (dbStatus) {
    case "in_progress":
    case "assigned":
      return "IN_PROGRESS";
    case "resolved":
      return "RESOLVED";
    case "closed":
    case "rejected":
      return "CLOSED";
    default:
      return "OPEN";
  }
}

function toAppPriority(dbPriority: string): "LOW" | "MEDIUM" | "HIGH" {
  const p = (dbPriority || "medium").toUpperCase();
  if (p === "URGENT" || p === "CRITICAL") return "HIGH";
  if (p === "LOW") return "LOW";
  return "MEDIUM";
}

/** Resolve JWT sub (customer_id text) to customers.id (number) for ticket_participants. */
async function resolveCustomerPk(
  db: ReturnType<typeof getDb>,
  sub: string,
  role: string
): Promise<number | null> {
  if (role !== "customer" || !sub) return null;
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, sub))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Generate unique ticket number (TKT- + date + short random). */
function generateTicketNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TKT-${date}-${r}`;
}

export async function supportRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.post(
    "/tickets",
    {
      schema: {
        body: createTicketBodySchema,
        response: {
          200: createResponseSchema,
          403: z.object({ error: z.string(), message: z.string() }),
          500: z.object({ message: z.string() }).optional(),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, sub, role);
      if (customerPk === null) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Only customers can create support tickets.",
        });
      }
      const body = createTicketBodySchema.parse(req.body);
      const ticketNumber = generateTicketNumber();

      const [ticket] = await db
        .insert(enterpriseTickets)
        .values({
          ticketNumber,
          serviceType: "other",
          ticketCategory: "non_order",
          ticketSection: "customer",
          sourceRole: "customer",
          subject: body.subject.trim(),
          description: body.description.trim(),
          status: "open",
          priority: "medium",
        })
        .returning({ id: enterpriseTickets.id });

      if (!ticket) {
        return reply.code(500).send({ message: "Could not create ticket." });
      }

      await db.insert(ticketParticipants).values({
        ticketId: ticket.id,
        participantRole: "creator",
        entityType: "customer",
        customerId: customerPk,
      });

      await db.insert(ticketMessages).values({
        ticketId: ticket.id,
        senderType: "customer",
        senderId: customerPk,
        messageType: "reply",
        message: body.description.trim(),
      });

      return {
        id: ticket.id,
        ticket_id: ticketNumber,
      };
    }
  );

  app.get(
    "/tickets",
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().min(1).max(100).optional().default(20),
          offset: z.coerce.number().min(0).optional().default(0),
        }),
        response: {
          200: listResponseSchema,
          403: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, sub, role);
      if (customerPk === null) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Only customers can list support tickets.",
        });
      }
      const { limit, offset } = req.query as { limit: number; offset: number };

      const participants = await db
        .select({ ticketId: ticketParticipants.ticketId })
        .from(ticketParticipants)
        .where(
          and(
            eq(ticketParticipants.entityType, "customer"),
            eq(ticketParticipants.customerId, customerPk)
          )
        );

      const ticketIds = participants.map((p) => p.ticketId);
      if (ticketIds.length === 0) {
        return { tickets: [], total: 0 };
      }

      const rows = await db
        .select({
          id: enterpriseTickets.id,
          ticketNumber: enterpriseTickets.ticketNumber,
          subject: enterpriseTickets.subject,
          description: enterpriseTickets.description,
          status: enterpriseTickets.status,
          priority: enterpriseTickets.priority,
          createdAt: enterpriseTickets.createdAt,
          updatedAt: enterpriseTickets.updatedAt,
          resolvedAt: enterpriseTickets.resolvedAt,
        })
        .from(enterpriseTickets)
        .where(inArray(enterpriseTickets.id, ticketIds))
        .orderBy(desc(enterpriseTickets.createdAt))
        .limit(limit)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(enterpriseTickets)
        .where(inArray(enterpriseTickets.id, ticketIds));

      const tickets = rows.map((r) => ({
        id: r.id,
        ticket_id: r.ticketNumber,
        subject: r.subject,
        description: r.description,
        status: toAppStatus(r.status),
        priority: toAppPriority(r.priority),
        created_at: r.createdAt!.toISOString(),
        updated_at: r.updatedAt!.toISOString(),
        resolved_at: r.resolvedAt?.toISOString() ?? null,
      }));

      return {
        tickets,
        total: Number(countRow?.count ?? 0),
      };
    }
  );

  app.get(
    "/tickets/:id",
    {
      schema: {
        params: z.object({ id: z.coerce.number() }),
        response: {
          200: ticketListItemSchema,
          403: z.object({ error: z.string(), message: z.string() }),
          404: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;
      const db = getDb();
      const customerPk = await resolveCustomerPk(db, sub, role);
      if (customerPk === null) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Only customers can view support tickets.",
        });
      }
      const { id } = req.params as { id: number };

      const participant = await db
        .select()
        .from(ticketParticipants)
        .where(
          and(
            eq(ticketParticipants.ticketId, id),
            eq(ticketParticipants.entityType, "customer"),
            eq(ticketParticipants.customerId, customerPk)
          )
        )
        .limit(1);

      if (participant.length === 0) {
        return reply.code(404).send({
          error: "not_found",
          message: "Ticket not found.",
        });
      }

      const rows = await db
        .select({
          id: enterpriseTickets.id,
          ticketNumber: enterpriseTickets.ticketNumber,
          subject: enterpriseTickets.subject,
          description: enterpriseTickets.description,
          status: enterpriseTickets.status,
          priority: enterpriseTickets.priority,
          createdAt: enterpriseTickets.createdAt,
          updatedAt: enterpriseTickets.updatedAt,
          resolvedAt: enterpriseTickets.resolvedAt,
        })
        .from(enterpriseTickets)
        .where(eq(enterpriseTickets.id, id))
        .limit(1);

      if (rows.length === 0) {
        return reply.code(404).send({
          error: "not_found",
          message: "Ticket not found.",
        });
      }

      const r = rows[0]!;
      return {
        id: r.id,
        ticket_id: r.ticketNumber,
        subject: r.subject,
        description: r.description,
        status: toAppStatus(r.status),
        priority: toAppPriority(r.priority),
        created_at: r.createdAt!.toISOString(),
        updated_at: r.updatedAt!.toISOString(),
        resolved_at: r.resolvedAt?.toISOString() ?? null,
      };
    }
  );
}

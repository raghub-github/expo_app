import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSql } from "../../db/client.js";
import { auth } from "../../plugins/auth.js";

const walletResponseSchema = z.object({
  balance: z.number(),
  locked_amount: z.number(),
  available_balance: z.number(),
  currency: z.literal("INR"),
});

const transactionSchema = z.object({
  id: z.string(),
  transaction_id: z.string(),
  type: z.enum(["credit", "debit", "refund", "expired", "bonus", "cashback", "reversal"]),
  title: z.string(),
  description: z.string().nullable(),
  amount: z.number(),
  balance_after: z.number().nullable(),
  reference_id: z.string().nullable(),
  reference_type: z.string().nullable(),
  status: z.string().nullable(),
  created_at: z.string(),
});

const transactionsResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  has_more: z.boolean(),
});

type TxFilter = "all" | "additions" | "deductions" | "refunds" | "expired";

function mapTransactionType(
  dbType: string,
  description: string | null
): z.infer<typeof transactionSchema>["type"] {
  const t = dbType.toUpperCase();
  const desc = (description ?? "").toLowerCase();
  if (desc.includes("expired")) return "expired";
  if (t === "REFUND") return "refund";
  if (t === "DEBIT") return "debit";
  if (t === "BONUS") return "bonus";
  if (t === "CASHBACK") return "cashback";
  if (t === "REVERSAL") return "reversal";
  return "credit";
}

function titleForTransaction(dbType: string, description: string | null): string {
  const desc = description?.trim();
  if (desc) return desc;
  const t = dbType.toUpperCase();
  if (t === "CREDIT") return "Credit balance added";
  if (t === "DEBIT") return "Order debit";
  if (t === "REFUND") return "Refund";
  if (t === "BONUS") return "Bonus credited";
  if (t === "CASHBACK") return "Cashback";
  if (t === "REVERSAL") return "Reversal";
  return dbType;
}

function matchesFilter(filter: TxFilter, mappedType: z.infer<typeof transactionSchema>["type"]): boolean {
  if (filter === "all") return true;
  if (filter === "additions") {
    return mappedType === "credit" || mappedType === "bonus" || mappedType === "cashback";
  }
  if (filter === "deductions") return mappedType === "debit";
  if (filter === "refunds") return mappedType === "refund";
  if (filter === "expired") return mappedType === "expired";
  return true;
}

async function resolveCustomerInternalId(
  sql: ReturnType<typeof getSql>,
  sub: string,
  role: string,
  phone: string | undefined
): Promise<{ internalId: number; customerId: string } | null> {
  let customerId = sub.startsWith("GM") ? sub : role === "customer" ? sub : null;
  if (!customerId && phone) {
    const rows = await sql`
      SELECT customer_id FROM customers WHERE primary_mobile = ${phone} LIMIT 1
    `;
    customerId = (rows[0] as { customer_id?: string } | undefined)?.customer_id ?? null;
  }
  if (!customerId) return null;

  const rows = await sql`
    SELECT id, customer_id FROM customers WHERE customer_id = ${customerId} LIMIT 1
  `;
  const row = rows[0] as { id?: number; customer_id?: string } | undefined;
  if (!row?.id) return null;
  return { internalId: Number(row.id), customerId: row.customer_id ?? customerId };
}

export async function meWalletRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get(
    "/wallet",
    {
      schema: {
        response: {
          200: walletResponseSchema,
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sql = getSql();
      const resolved = await resolveCustomerInternalId(
        sql,
        req.auth!.sub,
        req.auth!.role,
        req.auth?.phone
      );
      if (!resolved) {
        return reply.code(401).send({ message: "Customer not found" });
      }

      const walletRows = await sql`
        SELECT current_balance, locked_amount, available_balance
        FROM customer_wallet
        WHERE customer_id = ${resolved.internalId}
        LIMIT 1
      `;
      const walletRow = walletRows[0] as
        | { current_balance?: string | number; locked_amount?: string | number; available_balance?: string | number }
        | undefined;

      if (walletRow) {
        const balance = Number(walletRow.current_balance ?? 0);
        const locked = Number(walletRow.locked_amount ?? 0);
        const available = Number(walletRow.available_balance ?? balance - locked);
        return {
          balance,
          locked_amount: locked,
          available_balance: available,
          currency: "INR" as const,
        };
      }

      const customerRows = await sql`
        SELECT wallet_balance, wallet_locked_amount
        FROM customers
        WHERE id = ${resolved.internalId}
        LIMIT 1
      `;
      const customerRow = customerRows[0] as
        | { wallet_balance?: string | number; wallet_locked_amount?: string | number }
        | undefined;
      const balance = Number(customerRow?.wallet_balance ?? 0);
      const locked = Number(customerRow?.wallet_locked_amount ?? 0);
      return {
        balance,
        locked_amount: locked,
        available_balance: Math.max(balance - locked, 0),
        currency: "INR" as const,
      };
    }
  );

  app.get(
    "/wallet/transactions",
    {
      schema: {
        querystring: z.object({
          filter: z.enum(["all", "additions", "deductions", "refunds", "expired"]).default("all"),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: transactionsResponseSchema,
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { filter, limit, offset } = req.query as {
        filter: TxFilter;
        limit: number;
        offset: number;
      };
      const sql = getSql();
      const resolved = await resolveCustomerInternalId(
        sql,
        req.auth!.sub,
        req.auth!.role,
        req.auth?.phone
      );
      if (!resolved) {
        return reply.code(401).send({ message: "Customer not found" });
      }

      let rows: Record<string, unknown>[] = [];
      try {
        rows = (await sql`
          SELECT
            id,
            transaction_id,
            transaction_type,
            amount,
            balance_after,
            reference_id,
            reference_type,
            description,
            status,
            created_at
          FROM customer_wallet_transactions
          WHERE customer_id = ${resolved.internalId}
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
          OFFSET ${offset}
        `) as Record<string, unknown>[];
      } catch (err) {
        req.log?.warn?.({ err }, "customer_wallet_transactions query failed — returning empty list");
        return { transactions: [], has_more: false };
      }

      const hasMore = rows.length > limit;
      const slice = hasMore ? rows.slice(0, limit) : rows;

      const transactions = slice
        .map((row) => {
          const dbType = String(row.transaction_type ?? "CREDIT");
          const description = row.description != null ? String(row.description) : null;
          const mappedType = mapTransactionType(dbType, description);
          const rawAmount = Number(row.amount ?? 0);
          const signedAmount =
            mappedType === "debit" || mappedType === "expired"
              ? -Math.abs(rawAmount)
              : Math.abs(rawAmount);

          return {
            id: String(row.id),
            transaction_id: String(row.transaction_id ?? row.id),
            type: mappedType,
            title: titleForTransaction(dbType, description),
            description,
            amount: signedAmount,
            balance_after: row.balance_after != null ? Number(row.balance_after) : null,
            reference_id: row.reference_id != null ? String(row.reference_id) : null,
            reference_type: row.reference_type != null ? String(row.reference_type) : null,
            status: row.status != null ? String(row.status) : null,
            created_at: new Date(String(row.created_at)).toISOString(),
          };
        })
        .filter((tx) => matchesFilter(filter, tx.type));

      return { transactions, has_more: hasMore };
    }
  );
}

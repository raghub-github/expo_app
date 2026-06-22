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
  if (t === "TOPUP") return "credit";
  if (t === "BONUS") return "bonus";
  if (t === "CASHBACK") return "cashback";
  if (t === "REVERSAL") return "reversal";
  return "credit";
}

function titleForTransaction(
  dbType: string,
  description: string | null,
  referenceType?: string | null
): string {
  if (referenceType === "missed_offer_compensation") {
    return "Unlocked offer Credit";
  }
  const desc = description?.trim();
  if (desc) return desc;
  const t = dbType.toUpperCase();
  if (t === "CREDIT") return "Credit balance added";
  if (t === "TOPUP") return "GatiCash top-up";
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

const walletSettingsResponseSchema = z.object({
  auto_add_enabled: z.boolean(),
  auto_add_amount: z.number(),
  auto_add_threshold: z.number(),
  monthly_topup_limit: z.number(),
  monthly_topup_used: z.number(),
  monthly_topup_remaining: z.number(),
  max_wallet_balance: z.number(),
  added_balance_expiry_years: z.number(),
  linked_mobile_masked: z.string().nullable(),
});

const phoneChangeRequestBodySchema = z.object({
  new_mobile: z.string().min(10).max(15),
  no_transfer_acknowledged: z.literal(true),
});

const phoneChangeRequestResponseSchema = z.object({
  request_id: z.string(),
  status: z.string(),
  message: z.string(),
});

function normalizeIndianMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local = digits.length >= 12 && digits.startsWith("91") ? digits.slice(-10) : digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return local;
}

function maskIndianMobile(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  const digits = mobile.replace(/\D/g, "");
  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return mobile;
  return `+91-XXXXX-${local.slice(5)}`;
}

async function ensureCustomerWallet(sql: ReturnType<typeof getSql>, customerInternalId: number) {
  try {
    await sql`SELECT public.get_or_create_customer_wallet(${customerInternalId})`;
  } catch {
    /* migration not applied yet */
  }
}

async function fetchWalletSettings(
  sql: ReturnType<typeof getSql>,
  customerInternalId: number
): Promise<z.infer<typeof walletSettingsResponseSchema>> {
  await ensureCustomerWallet(sql, customerInternalId);

  let settingsRow:
    | {
        auto_add_enabled?: boolean;
        auto_add_amount?: string | number;
        auto_add_threshold?: string | number;
        monthly_topup_limit?: string | number;
        monthly_topup_used?: string | number;
      }
    | undefined;

  let walletRow:
    | {
        max_balance?: string | number;
        added_balance_expiry_years?: number;
        current_balance?: string | number;
      }
    | undefined;

  let linkedMobile: string | null = null;

  try {
    await sql`SELECT public.customer_wallet_reset_monthly_topup_if_needed(${customerInternalId})`;
  } catch {
    /* optional helper */
  }

  try {
    const rows = await sql`
      SELECT
        auto_add_enabled,
        auto_add_amount,
        auto_add_threshold,
        monthly_topup_limit,
        monthly_topup_used
      FROM customer_wallet_settings
      WHERE customer_id = ${customerInternalId}
      LIMIT 1
    `;
    settingsRow = rows[0] as typeof settingsRow;
  } catch {
    settingsRow = undefined;
  }

  try {
    const rows = await sql`
      SELECT max_balance, added_balance_expiry_years, current_balance
      FROM customer_wallet
      WHERE customer_id = ${customerInternalId}
      LIMIT 1
    `;
    walletRow = rows[0] as typeof walletRow;
  } catch {
    walletRow = undefined;
  }

  const customerRows = await sql`
    SELECT primary_mobile FROM customers WHERE id = ${customerInternalId} LIMIT 1
  `;
  linkedMobile = (customerRows[0] as { primary_mobile?: string } | undefined)?.primary_mobile ?? null;

  const monthlyLimit = Number(settingsRow?.monthly_topup_limit ?? 50000);
  const monthlyUsed = Number(settingsRow?.monthly_topup_used ?? 0);

  return {
    auto_add_enabled: Boolean(settingsRow?.auto_add_enabled ?? false),
    auto_add_amount: Number(settingsRow?.auto_add_amount ?? 0),
    auto_add_threshold: Number(settingsRow?.auto_add_threshold ?? 500),
    monthly_topup_limit: monthlyLimit,
    monthly_topup_used: monthlyUsed,
    monthly_topup_remaining: Math.max(monthlyLimit - monthlyUsed, 0),
    max_wallet_balance: Number(walletRow?.max_balance ?? 50000),
    added_balance_expiry_years: Number(walletRow?.added_balance_expiry_years ?? 10),
    linked_mobile_masked: maskIndianMobile(linkedMobile),
  };
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

      await ensureCustomerWallet(sql, resolved.internalId);

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
          const referenceType = row.reference_type != null ? String(row.reference_type) : null;
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
            title: titleForTransaction(dbType, description, referenceType),
            description,
            amount: signedAmount,
            balance_after: row.balance_after != null ? Number(row.balance_after) : null,
            reference_id: row.reference_id != null ? String(row.reference_id) : null,
            reference_type: referenceType,
            status: row.status != null ? String(row.status) : null,
            created_at: new Date(String(row.created_at)).toISOString(),
          };
        })
        .filter((tx) => matchesFilter(filter, tx.type));

      return { transactions, has_more: hasMore };
    }
  );

  app.get(
    "/wallet/settings",
    {
      schema: {
        response: {
          200: walletSettingsResponseSchema,
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
      return fetchWalletSettings(sql, resolved.internalId);
    }
  );

  app.patch(
    "/wallet/settings",
    {
      schema: {
        body: z
          .object({
            auto_add_enabled: z.boolean().optional(),
            auto_add_amount: z.number().min(1).max(50000).optional(),
            auto_add_threshold: z.number().min(1).max(50000).optional(),
          })
          .refine(
            (body) =>
              body.auto_add_enabled !== true ||
              body.auto_add_threshold == null ||
              body.auto_add_amount == null ||
              body.auto_add_threshold <= body.auto_add_amount,
            { message: "auto_add_threshold cannot exceed auto_add_amount" }
          ),
        response: {
          200: walletSettingsResponseSchema,
          400: z.object({ message: z.string() }),
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const body = req.body as {
        auto_add_enabled?: boolean;
        auto_add_amount?: number;
        auto_add_threshold?: number;
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

      const nextEnabled = body.auto_add_enabled;
      const nextAmount = body.auto_add_amount;
      const nextThreshold = body.auto_add_threshold;

      if (
        nextEnabled === true &&
        nextThreshold != null &&
        nextAmount != null &&
        nextThreshold > nextAmount
      ) {
        return reply.code(400).send({
          message: "Threshold amount cannot be greater than add money amount",
        });
      }

      try {
        await sql`
          SELECT public.upsert_customer_wallet_settings(
            ${resolved.internalId},
            ${nextEnabled ?? null},
            ${nextAmount ?? null},
            ${nextThreshold ?? null}
          )
        `;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update wallet settings";
        if (message.includes("auto_add_threshold")) {
          return reply.code(400).send({
            message: "Threshold amount cannot be greater than add money amount",
          });
        }

        await ensureCustomerWallet(sql, resolved.internalId);
        try {
          await sql`
            INSERT INTO customer_wallet_settings (customer_id)
            VALUES (${resolved.internalId})
            ON CONFLICT (customer_id) DO NOTHING
          `;
          const current = await fetchWalletSettings(sql, resolved.internalId);
          const enabled = nextEnabled ?? current.auto_add_enabled;
          const amount = nextAmount ?? current.auto_add_amount;
          const threshold = nextThreshold ?? current.auto_add_threshold;
          if (enabled && threshold > amount) {
            return reply.code(400).send({
              message: "Threshold amount cannot be greater than add money amount",
            });
          }
          await sql`
            UPDATE customer_wallet_settings
            SET
              auto_add_enabled = ${enabled},
              auto_add_amount = ${amount},
              auto_add_threshold = ${threshold},
              updated_at = NOW()
            WHERE customer_id = ${resolved.internalId}
          `;
        } catch (fallbackErr) {
          req.log?.error?.({ err: fallbackErr }, "wallet settings patch failed");
          return reply.code(400).send({ message: "Wallet settings are not available yet" });
        }
      }

      return fetchWalletSettings(sql, resolved.internalId);
    }
  );

  app.post(
    "/wallet/phone-change-request",
    {
      schema: {
        body: phoneChangeRequestBodySchema,
        response: {
          200: phoneChangeRequestResponseSchema,
          400: z.object({ message: z.string() }),
          401: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { new_mobile, no_transfer_acknowledged } = req.body as z.infer<
        typeof phoneChangeRequestBodySchema
      >;
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

      const normalized = normalizeIndianMobile(new_mobile);
      if (!normalized) {
        return reply.code(400).send({ message: "Enter a valid 10-digit Indian mobile number" });
      }

      const customerRows = await sql`
        SELECT primary_mobile, primary_mobile_normalized
        FROM customers
        WHERE id = ${resolved.internalId}
        LIMIT 1
      `;
      const customer = customerRows[0] as
        | { primary_mobile?: string; primary_mobile_normalized?: string }
        | undefined;
      const currentMobile = customer?.primary_mobile ?? "";
      const currentNormalized =
        customer?.primary_mobile_normalized ?? normalizeIndianMobile(currentMobile) ?? "";

      if (normalized === currentNormalized) {
        return reply.code(400).send({ message: "New number must be different from current number" });
      }

      const duplicateRows = await sql`
        SELECT id FROM customers
        WHERE id <> ${resolved.internalId}
          AND (
            primary_mobile_normalized = ${normalized}
            OR REGEXP_REPLACE(primary_mobile, '\\D', '', 'g') LIKE ${"%" + normalized}
          )
        LIMIT 1
      `;
      if (duplicateRows.length > 0) {
        return reply.code(409).send({ message: "This mobile number is already registered" });
      }

      await ensureCustomerWallet(sql, resolved.internalId);

      let balance = 0;
      try {
        const walletRows = await sql`
          SELECT current_balance FROM customer_wallet
          WHERE customer_id = ${resolved.internalId}
          LIMIT 1
        `;
        balance = Number((walletRows[0] as { current_balance?: string | number } | undefined)?.current_balance ?? 0);
      } catch {
        const fallback = await sql`
          SELECT wallet_balance FROM customers WHERE id = ${resolved.internalId} LIMIT 1
        `;
        balance = Number((fallback[0] as { wallet_balance?: string | number } | undefined)?.wallet_balance ?? 0);
      }

      const requestedMobile = `+91${normalized}`;

      try {
        const pending = await sql`
          SELECT id FROM customer_wallet_phone_change_requests
          WHERE customer_id = ${resolved.internalId}
            AND status IN ('PENDING', 'IN_REVIEW')
          LIMIT 1
        `;
        if (pending.length > 0) {
          return reply.code(409).send({
            message: "A phone change request is already in progress",
          });
        }

        const inserted = await sql`
          INSERT INTO customer_wallet_phone_change_requests (
            customer_id,
            current_mobile,
            requested_mobile,
            requested_mobile_normalized,
            balance_at_request,
            no_transfer_acknowledged,
            metadata
          ) VALUES (
            ${resolved.internalId},
            ${currentMobile},
            ${requestedMobile},
            ${normalized},
            ${balance},
            ${no_transfer_acknowledged},
            jsonb_build_object('source', 'customer_app')
          )
          RETURNING id
        `;
        const requestId = String((inserted[0] as { id?: number | string } | undefined)?.id ?? "");

        return {
          request_id: requestId,
          status: "PENDING",
          message:
            "Request submitted. Our team will verify the new number. GatiCash balance will not transfer automatically.",
        };
      } catch (err) {
        req.log?.error?.({ err }, "phone change request insert failed");
        return reply.code(400).send({
          message: "Phone change requests are not available yet. Please contact support.",
        });
      }
    }
  );

  app.post(
    "/wallet/claim-missed-offer-compensation",
    {
      schema: {
        body: z.object({
          merchantId: z.string().min(1),
          amountInr: z.number().positive().max(500),
          offerKey: z.string().min(1).max(120),
          offerId: z.number().int().positive().nullable().optional(),
          offerSource: z.enum(["platform", "merchant"]).nullable().optional(),
          offerKind: z.string().max(64).optional(),
          offerTitle: z.string().max(120).optional(),
        }),
        response: {
          200: z.object({
            ok: z.literal(true),
            amount_inr: z.number(),
            balance_after: z.number(),
            transaction_id: z.string(),
          }),
          400: z.object({ message: z.string() }),
          401: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const body = req.body as {
        merchantId: string;
        amountInr: number;
        offerKey: string;
        offerId?: number | null;
        offerSource?: "platform" | "merchant" | null;
        offerKind?: string;
        offerTitle?: string;
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

      await ensureCustomerWallet(sql, resolved.internalId);

      const amount = Math.round(body.amountInr * 100) / 100;
      if (amount <= 0 || amount > 500) {
        return reply.code(400).send({ message: "Invalid compensation amount" });
      }

      const idempotencyKey = `missed_offer_${resolved.internalId}_${body.offerKey}`.slice(0, 120);
      const description = body.offerTitle?.trim() || "Offer unlocked";

      try {
        const existing = await sql`
          SELECT id, balance_after FROM customer_wallet_transactions
          WHERE transaction_id = ${idempotencyKey}
          LIMIT 1
        `;
        if (existing.length > 0) {
          const row = existing[0] as { balance_after?: string | number };
          return {
            ok: true as const,
            amount_inr: amount,
            balance_after: Number(row.balance_after ?? 0),
            transaction_id: idempotencyKey,
          };
        }

        await sql`
          SELECT public.customer_wallet_credit(
            ${resolved.internalId},
            ${amount},
            'BONUS'::public.wallet_transaction_type,
            ${body.offerId != null ? String(body.offerId) : body.offerKey},
            ${"missed_offer_compensation"},
            ${description},
            NULL,
            ${idempotencyKey},
            ${JSON.stringify({
              merchantId: body.merchantId,
              offerKey: body.offerKey,
              offerSource: body.offerSource ?? null,
              offerKind: body.offerKind ?? null,
              offerTitle: description,
              source: "customer_app_checkout",
            })}::jsonb,
            'BONUS'::public.customer_wallet_balance_lot_type,
            ${null}
          ) AS tx_id
        `;

        const walletRows = await sql`
          SELECT current_balance FROM customer_wallet
          WHERE customer_id = ${resolved.internalId}
          LIMIT 1
        `;
        const balanceAfter = Number(
          (walletRows[0] as { current_balance?: string | number } | undefined)?.current_balance ?? 0
        );

        return {
          ok: true as const,
          amount_inr: amount,
          balance_after: balanceAfter,
          transaction_id: idempotencyKey,
        };
      } catch (err) {
        req.log?.error?.({ err }, "claim missed offer compensation failed");
        const message =
          err instanceof Error ? err.message : "Could not credit GatiCash for missed offer";
        if (message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique")) {
          return reply.code(409).send({ message: "This offer compensation was already claimed" });
        }
        return reply.code(400).send({ message: "Could not add missed-offer credit to GatiCash" });
      }
    }
  );
}

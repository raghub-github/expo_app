/**
 * Super Admin reporting endpoints for the Ride Billing Architecture.
 *
 * All three endpoints (summary / cash-recovery / watchlist) are read-only
 * aggregates over the immutable `ride_settlements` table + `rider_wallet` +
 * `rider_service_block_history`, so they are safe to hit from admin dashboards
 * without any transactional impact on live rides.
 *
 * Auth: JWT admin-like role OR X-Internal-Secret from the Next.js proxy —
 * identical pattern to the ride-wallet-config admin routes.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { auth } from "../../../plugins/auth.js";
import { getEnv } from "../../../config/env.js";
import {
  defaultReportRange,
  listPostpaidSettlements,
  loadCashRecoveryReport,
  loadNegativeWalletWatchlist,
  loadRideSettlementSummary,
  resolveSettlementReconciliation,
} from "./rideSettlement.reports.js";

function isAdminLikeRole(r: string): boolean {
  return (
    r === "admin" || r === "super_admin" || r === "manager" || r === "support"
  );
}

function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const secret = getEnv().INTERNAL_API_TOKEN;
  if (!secret) return false;
  const h = req.headers["x-internal-secret"];
  return typeof h === "string" && h === secret;
}

const rangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const rangeSchema = z.object({ fromIso: z.string(), toIso: z.string() });

const summaryTotalsSchema = z.object({
  rides: z.number(),
  customerBill: z.number(),
  customerPaid: z.number(),
  companyReceivable: z.number(),
  companyReceived: z.number(),
  riderEarnings: z.number(),
  outstanding: z.number(),
  walletDebit: z.number(),
  walletCredit: z.number(),
  commission: z.number(),
  taxes: z.number(),
  surgeTotal: z.number(),
  surgeCustomerShare: z.number(),
  surgeCompanyShare: z.number(),
  discountTotal: z.number(),
  couponDiscount: z.number(),
  companyFundedDiscount: z.number(),
});

const summaryResponseSchema = z.object({
  range: rangeSchema,
  totals: summaryTotalsSchema,
  byPaymentMode: z.array(
    z.object({
      paymentMode: z.enum(["online", "cash", "wallet", "mixed"]),
      rides: z.number(),
      customerBill: z.number(),
      companyReceivable: z.number(),
      companyReceived: z.number(),
      riderEarnings: z.number(),
      outstanding: z.number(),
    })
  ),
  byStatus: z.array(
    z.object({
      status: z.enum(["pending", "settled", "failed", "reversed"]),
      rides: z.number(),
      outstanding: z.number(),
    })
  ),
});

const cashResponseSchema = z.object({
  range: rangeSchema,
  cashRides: z.number(),
  cashCustomerBill: z.number(),
  cashCompanyReceivable: z.number(),
  cashWalletDebit: z.number(),
  outstandingCashCompany: z.number(),
  topRiders: z.array(
    z.object({
      riderId: z.number(),
      rides: z.number(),
      companyReceivable: z.number(),
      walletDebit: z.number(),
    })
  ),
});

const watchlistResponseSchema = z.object({
  items: z.array(
    z.object({
      riderId: z.number(),
      currentBalance: z.number(),
      serviceNegativeUsage: z.number(),
      blockedServices: z.array(z.string()),
      blockReason: z.string().nullable(),
      lastBlockedAt: z.string().nullable(),
    })
  ),
});

const settlementsQuerySchema = rangeQuerySchema.extend({
  service: z.enum(["person_ride", "parcel"]).optional(),
  method: z.enum(["cash", "online"]).optional(),
  status: z.enum(["pending", "settled", "failed", "reversed"]).optional(),
  reconciliation: z.enum(["none", "required", "resolved"]).optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const resolveBodySchema = z.object({ note: z.string().trim().min(3).max(500) });

/** Writes are super-admin only; reads stay open to the admin-like roles above. */
function canResolve(req: FastifyRequest): boolean {
  if (internalSecretGrantsAdmin(req)) {
    return String(req.headers["x-actor-role"] ?? "") === "super_admin";
  }
  return req.auth?.role === "super_admin";
}

function resolveRange(q: z.infer<typeof rangeQuerySchema>): {
  fromIso: string;
  toIso: string;
} {
  const def = defaultReportRange();
  return {
    fromIso: q.from ?? def.fromIso,
    toIso: q.to ?? def.toIso,
  };
}

export const rideSettlementReportsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      if (internalSecretGrantsAdmin(req)) return;
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminLikeRole(role)) {
        return reply
          .code(403)
          .send({ error: "forbidden", reason: "admin_role_required" });
      }
    });

    admin.get(
      "/summary",
      {
        schema: {
          querystring: rangeQuerySchema,
          response: {
            200: summaryResponseSchema,
            403: z.object({ error: z.string() }),
          },
        },
      },
      async (req) => {
        const q = rangeQuerySchema.parse(req.query ?? {});
        return loadRideSettlementSummary(resolveRange(q));
      }
    );

    admin.get(
      "/cash-recovery",
      {
        schema: {
          querystring: rangeQuerySchema,
          response: {
            200: cashResponseSchema,
            403: z.object({ error: z.string() }),
          },
        },
      },
      async (req) => {
        const q = rangeQuerySchema.parse(req.query ?? {});
        return loadCashRecoveryReport(resolveRange(q));
      }
    );

    admin.get(
      "/negative-wallet-watchlist",
      {
        schema: {
          response: {
            200: watchlistResponseSchema,
            403: z.object({ error: z.string() }),
          },
        },
      },
      async () => {
        const items = await loadNegativeWalletWatchlist(50);
        return { items };
      }
    );

    // Every post-paid settlement (Ride + Parcel): cash vs online, wallet movement,
    // commission vs subsidy, and reconciliation state. Range defaults to 7 days.
    admin.get(
      "/settlements",
      { schema: { querystring: settlementsQuerySchema } },
      async (req) => {
        const q = settlementsQuerySchema.parse(req.query ?? {});
        return listPostpaidSettlements({ ...resolveRange(q), ...q });
      }
    );

    admin.post(
      "/settlements/:settlementId/resolve",
      {
        schema: {
          params: z.object({ settlementId: z.string().min(1).max(80) }),
          body: resolveBodySchema,
        },
      },
      async (req, reply) => {
        if (!canResolve(req)) {
          return reply.code(403).send({ error: "forbidden", reason: "super_admin_required" });
        }
        const { settlementId } = req.params as { settlementId: string };
        const { note } = resolveBodySchema.parse(req.body ?? {});
        const actorHeader = req.headers["x-actor-email"];
        const actor =
          (typeof actorHeader === "string" && actorHeader.trim()) || req.auth?.sub || "super_admin";
        const ok = await resolveSettlementReconciliation({ settlementId, note, actor });
        if (!ok) return reply.code(409).send({ error: "not_pending_reconciliation" });
        return { ok: true };
      }
    );
  });
};

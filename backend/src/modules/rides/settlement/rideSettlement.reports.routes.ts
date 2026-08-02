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
  loadCashRecoveryReport,
  loadNegativeWalletWatchlist,
  loadRideSettlementSummary,
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
  });
};

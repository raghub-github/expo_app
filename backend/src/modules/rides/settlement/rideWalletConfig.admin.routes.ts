/**
 * Super Admin routes for the Ride Wallet policy (ride_wallet_config).
 *
 * Auth accepts either:
 *   1. JWT with admin / super_admin / manager / support role
 *   2. X-Internal-Secret header matching INTERNAL_API_TOKEN (Next.js dashboard
 *      proxy). Same pattern used by merchant-subscription.admin.routes.
 *
 * Registered under /v1/admin/ride-wallet-config in index.ts.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { auth } from "../../../plugins/auth.js";
import { getEnv } from "../../../config/env.js";
import { getSql } from "../../../db/client.js";
import {
  loadRideWalletPolicy,
  updateRideWalletPolicy,
} from "./rideSettlement.repository.js";

function isAdminLikeRole(r: string): boolean {
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}

function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const secret = getEnv().INTERNAL_API_TOKEN;
  if (!secret) return false;
  const h = req.headers["x-internal-secret"];
  return typeof h === "string" && h === secret;
}

const updateBodySchema = z.object({
  serviceNegativeThreshold: z.number().positive().max(100_000),
  globalBlockThreshold: z.number().negative().min(-1_000_000),
  cashSettlementEnabled: z.boolean().optional(),
  autoUnblockOnZero: z.boolean().optional(),
  commissionOnToll: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

const policyResponseSchema = z.object({
  serviceNegativeThreshold: z.number(),
  globalBlockThreshold: z.number(),
  cashSettlementEnabled: z.boolean(),
  autoUnblockOnZero: z.boolean(),
  commissionOnToll: z.boolean(),
});

const historyRowSchema = z.object({
  id: z.number(),
  serviceNegativeThreshold: z.number(),
  globalBlockThreshold: z.number(),
  cashSettlementEnabled: z.boolean(),
  autoUnblockOnZero: z.boolean(),
  commissionOnToll: z.boolean().optional(),
  changedBySystemUserId: z.number().nullable(),
  reason: z.string().nullable(),
  effectiveFrom: z.string(),
  createdAt: z.string(),
});

export const rideWalletConfigAdminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      if (internalSecretGrantsAdmin(req)) return;
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminLikeRole(role)) {
        return reply.code(403).send({ error: "forbidden", reason: "admin_role_required" });
      }
    });

    admin.get(
      "/",
      {
        schema: {
          response: {
            200: policyResponseSchema,
            403: z.object({ error: z.string() }),
          },
        },
      },
      async () => loadRideWalletPolicy()
    );

    admin.put(
      "/",
      {
        schema: {
          body: updateBodySchema,
          response: {
            200: policyResponseSchema,
            400: z.object({ error: z.string(), message: z.string().optional() }),
            403: z.object({ error: z.string() }),
          },
        },
      },
      async (req, reply) => {
        const body = updateBodySchema.parse(req.body ?? {});
        try {
          const policy = await updateRideWalletPolicy({
            serviceNegativeThreshold: body.serviceNegativeThreshold,
            globalBlockThreshold: body.globalBlockThreshold,
            cashSettlementEnabled: body.cashSettlementEnabled,
            autoUnblockOnZero: body.autoUnblockOnZero,
            commissionOnToll: body.commissionOnToll,
            reason: body.reason ?? null,
          });
          return policy;
        } catch (e) {
          const err = e as Error & { statusCode?: number };
          const status = err.statusCode ?? 500;
          return reply
            .code(status as 400)
            .send({ error: "invalid_config", message: err.message });
        }
      }
    );

    admin.get(
      "/history",
      {
        schema: {
          response: {
            200: z.object({ items: z.array(historyRowSchema) }),
            403: z.object({ error: z.string() }),
          },
        },
      },
      async () => {
        const sql = getSql();
        const rows = await sql<
          Array<{
            id: number;
            service_negative_threshold: string | number;
            global_block_threshold: string | number;
            cash_settlement_enabled: boolean;
            auto_unblock_on_zero: boolean;
            commission_on_toll?: boolean;
            changed_by_system_user_id: number | null;
            reason: string | null;
            effective_from: string | Date;
            created_at: string | Date;
          }>
        >`
          SELECT id, service_negative_threshold, global_block_threshold,
                 cash_settlement_enabled, auto_unblock_on_zero,
                 COALESCE(commission_on_toll, FALSE) AS commission_on_toll,
                 changed_by_system_user_id, reason,
                 effective_from, created_at
          FROM ride_wallet_config_history
          ORDER BY effective_from DESC, id DESC
          LIMIT 100
        `;
        const items = rows.map((r) => ({
          id: Number(r.id),
          serviceNegativeThreshold: Number(r.service_negative_threshold),
          globalBlockThreshold: Number(r.global_block_threshold),
          cashSettlementEnabled: r.cash_settlement_enabled !== false,
          autoUnblockOnZero: r.auto_unblock_on_zero !== false,
          commissionOnToll: r.commission_on_toll === true,
          changedBySystemUserId: r.changed_by_system_user_id,
          reason: r.reason,
          effectiveFrom:
            r.effective_from instanceof Date
              ? r.effective_from.toISOString()
              : String(r.effective_from),
          createdAt:
            r.created_at instanceof Date
              ? r.created_at.toISOString()
              : String(r.created_at),
        }));
        return { items };
      }
    );
  });
};

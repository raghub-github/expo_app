/**
 * Super Admin gate for Fastify /v1/referral admin endpoints.
 * Dashboard staff JWTs and customer/rider/merchant tokens must not reach these routes.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { getEnv } from "../../config/env.js";

export function isReferralSuperAdminRole(role: string | undefined | null): boolean {
  const r = String(role ?? "").toLowerCase();
  return r === "super_admin" || r === "system";
}

export function headerMatchesInternalSecret(req: FastifyRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  const h = req.headers["x-internal-secret"];
  return typeof h === "string" && h.length > 0 && h === secret;
}

export function internalSecretGrantsReferralAdmin(req: FastifyRequest): boolean {
  return headerMatchesInternalSecret(req, getEnv().INTERNAL_API_TOKEN);
}

/** Partner Site / AM Dashboard onboarding apply — same X-Internal-Secret as schedule ticks. */
export function internalSecretGrantsReferralOnboarding(req: FastifyRequest): boolean {
  const env = getEnv();
  return (
    headerMatchesInternalSecret(req, env.INTERNAL_API_TOKEN) ||
    headerMatchesInternalSecret(req, env.BACKEND_SCHEDULE_TICK_SECRET)
  );
}

export async function requireReferralSuperAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (internalSecretGrantsReferralAdmin(req)) return;
  const role = req.auth?.role ?? "";
  if (!req.auth?.sub || !isReferralSuperAdminRole(role)) {
    return reply.code(403).send({
      ok: false,
      error: "forbidden",
      reason: "super_admin_required",
    }) as unknown as void;
  }
}

import { eq } from "drizzle-orm";
import { getDb, withDbSlot } from "../db/client.js";
import { customers } from "../db/schema.js";
import type { AuthContext } from "../plugins/auth.js";
import type { FastifyRequest } from "fastify";

const PK_CACHE_TTL_MS = 60_000;
const pkCache = new Map<string, { pk: number | null; expiresAt: number }>();

export function customerPkFromAuth(auth: AuthContext | undefined): number | null {
  if (auth?.customerPk != null && auth.customerPk > 0) return auth.customerPk;
  return null;
}

/** Prefer auth.customerPk (set in auth hook); fall back to a short-lived cache. */
export async function resolveCustomerPkForRequest(auth: AuthContext, req?: Pick<FastifyRequest, "dbSlotHeld">): Promise<number | null> {
  const fromAuth = customerPkFromAuth(auth);
  if (fromAuth != null) return fromAuth;
  if (auth.role !== "customer" || !auth.sub?.startsWith("GM")) return null;
  return resolveCustomerPkFromSubCached(auth.sub, req);
}

export async function resolveCustomerPkFromSubCached(
  sub: string,
  req?: Pick<FastifyRequest, "dbSlotHeld">
): Promise<number | null> {
  const hit = pkCache.get(sub);
  if (hit && hit.expiresAt > Date.now()) return hit.pk;

  const pk = await withDbSlot(async () => {
    const db = getDb();
    const [row] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.customerId, sub))
      .limit(1);
    return row?.id ?? null;
  }, req);

  pkCache.set(sub, { pk, expiresAt: Date.now() + PK_CACHE_TTL_MS });
  return pk;
}

export function invalidateCustomerPkCache(sub: string): void {
  pkCache.delete(sub);
}

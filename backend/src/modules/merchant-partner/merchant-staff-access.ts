import type { FastifyReply } from "fastify";
import type { AuthContext } from "../../plugins/auth.js";
import { permissionsForRole } from "../auth/merchant-account-resolve.js";

export type MerchantAccessRole = "OWNER" | "MANAGER" | "STAFF";

export function effectiveMerchantAccessRole(auth?: AuthContext | null): MerchantAccessRole {
  const r = auth?.merchant_access_role;
  if (r === "MANAGER" || r === "STAFF") return r;
  return "OWNER";
}

export function merchantHasPermission(auth: AuthContext | undefined, permissionId: string): boolean {
  const role = effectiveMerchantAccessRole(auth);
  return permissionsForRole(role).includes(permissionId);
}

/** Returns true when the reply was already sent (caller should return). */
export function denyUnlessMerchantPermission(
  reply: FastifyReply,
  auth: AuthContext | undefined,
  permissionId: string,
  message?: string
): boolean {
  if (merchantHasPermission(auth, permissionId)) return false;
  reply.code(403).send({
    error: "forbidden",
    message: message ?? "You do not have permission for this action.",
  });
  return true;
}

/** Store staff may only touch their JWT-scoped store (numeric merchant_stores.id). */
export function denyUnlessStoreInScope(
  reply: FastifyReply,
  auth: AuthContext | undefined,
  storeId: number
): boolean {
  const role = effectiveMerchantAccessRole(auth);
  if (role === "OWNER") return false;
  const scoped = auth?.merchant_store_id;
  if (scoped != null && Number(scoped) === Number(storeId)) return false;
  reply.code(403).send({
    error: "store_forbidden",
    message: "This store is outside your access.",
  });
  return true;
}

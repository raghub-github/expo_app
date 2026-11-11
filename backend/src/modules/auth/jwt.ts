import { SignJWT } from "jose";
import { createSecretKey } from "node:crypto";
import type { Role } from "@gatimitra/contracts";

type IssueJwtArgs = {
  jwtSecret: string;
  sub: string;
  role: Role;
  phoneE164: string;
  deviceId: string;
  exp: number; // unix seconds
  /** Merchant staff access role when not the brand owner. */
  merchantAccessRole?: "OWNER" | "MANAGER" | "STAFF";
  merchantStaffId?: number | null;
  merchantStoreId?: number | null;
};

/**
 * Issues a JWT that is compatible with Supabase Postgres RLS expectations:
 * - HS256 signed with `SUPABASE_JWT_SECRET` (backend-only)
 * - includes `role` + user identity claims
 *
 * IMPORTANT: the Rider app never gets the signing secret—only the token.
 */
export async function issueSupabaseCompatibleJwt(args: IssueJwtArgs): Promise<string> {
  const key = createSecretKey(Buffer.from(args.jwtSecret, "utf-8"));

  // Keep claims minimal; anything sensitive should stay server-side.
  const claims: Record<string, unknown> = {
    role: args.role,
    phone: args.phoneE164,
    device_id: args.deviceId,
  };
  if (args.role === "merchant") {
    claims.merchant_access_role = args.merchantAccessRole ?? "OWNER";
  }
  if (args.merchantStaffId != null && Number.isFinite(args.merchantStaffId)) {
    claims.merchant_staff_id = args.merchantStaffId;
  }
  if (args.merchantStoreId != null && Number.isFinite(args.merchantStoreId)) {
    claims.merchant_store_id = args.merchantStoreId;
  }

  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(args.sub)
    .setIssuedAt()
    .setExpirationTime(args.exp)
    .sign(key);
}



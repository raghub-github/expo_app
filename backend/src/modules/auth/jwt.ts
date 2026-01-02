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
  return await new SignJWT({
    role: args.role,
    phone: args.phoneE164,
    device_id: args.deviceId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(args.sub)
    .setIssuedAt()
    .setExpirationTime(args.exp)
    .sign(key);
}



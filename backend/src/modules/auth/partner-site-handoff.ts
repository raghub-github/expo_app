/**
 * Mint a short-lived partnersite handoff: real Supabase session tokens
 * wrapped in a signed JWT so the merchant app can open register-store
 * without asking the user to log in again on the partner portal.
 */

import { SignJWT, jwtVerify } from "jose";
import { createSecretKey } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getEnv } from "../../config/env.js";
import { getSupabase } from "../../lib/supabase.js";
import { getSql } from "../../db/client.js";

export const PARTNER_HANDOFF_TYP = "mx_partner_handoff";
const HANDOFF_TTL_SEC = 120;

export type PartnerHandoffClaims = {
  typ: typeof PARTNER_HANDOFF_TYP;
  at: string;
  rt: string;
  next: string;
  pid: string;
};

type ParentRow = {
  id: number;
  parent_merchant_id: string;
  owner_email: string | null;
  registered_phone: string | null;
  supabase_user_id: string | null;
};

function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

async function resolveAuthEmailForParent(
  parent: ParentRow,
  preferredSupabaseUserId?: string | null
): Promise<{ email: string; supabaseUserId: string | null }> {
  const supabase = getSupabase();
  const sql = getSql();
  let userId =
    (preferredSupabaseUserId && preferredSupabaseUserId.trim()) ||
    (parent.supabase_user_id && String(parent.supabase_user_id).trim()) ||
    null;

  if (userId) {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (!error && data.user) {
      let email = normalizeEmail(data.user.email);
      if (!email) {
        const ownerEmail = normalizeEmail(parent.owner_email);
        if (ownerEmail) {
          const updated = await supabase.auth.admin.updateUserById(userId, {
            email: ownerEmail,
            email_confirm: true,
          });
          email = normalizeEmail(updated.data.user?.email) ?? ownerEmail;
        }
      }
      if (email) return { email, supabaseUserId: userId };
    }
  }

  const ownerEmail = normalizeEmail(parent.owner_email);
  if (ownerEmail) {
    return { email: ownerEmail, supabaseUserId: userId };
  }

  // Last resort: look up auth.users by phone (same Postgres as Supabase).
  const digits = phoneDigits(parent.registered_phone);
  const ten = digits.length >= 10 ? digits.slice(-10) : "";
  if (ten) {
    try {
      const rows = await sql`
        SELECT id::text AS id, email
        FROM auth.users
        WHERE phone LIKE ${"%" + ten}
           OR phone = ${"+91" + ten}
           OR phone = ${ten}
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1
      `;
      const row = rows[0] as { id?: string; email?: string | null } | undefined;
      if (row?.id) {
        let email = normalizeEmail(row.email);
        const fallbackEmail = normalizeEmail(parent.owner_email);
        if (!email && fallbackEmail) {
          await supabase.auth.admin.updateUserById(row.id, {
            email: fallbackEmail,
            email_confirm: true,
          });
          email = fallbackEmail;
        }
        if (email) {
          if (!parent.supabase_user_id) {
            await sql`
              UPDATE merchant_parents
              SET supabase_user_id = ${row.id}::uuid
              WHERE id = ${parent.id} AND supabase_user_id IS NULL
            `.catch(() => undefined);
          }
          return { email, supabaseUserId: row.id };
        }
      }
    } catch {
      // auth.users may be inaccessible on some DB roles — fall through
    }
  }

  throw Object.assign(
    new Error(
      "Could not open partner portal session. Sign in once at partner.gatimitra.com with Google or email, then try again from the app."
    ),
    { statusCode: 400, code: "handoff_identity_missing" }
  );
}

/**
 * Create Supabase access + refresh tokens for this merchant parent.
 */
export async function mintPartnerSiteSessionTokens(args: {
  parent: ParentRow;
  preferredSupabaseUserId?: string | null;
}): Promise<{ accessToken: string; refreshToken: string; supabaseUserId: string | null }> {
  const env = getEnv();
  const supabase = getSupabase();
  const { email, supabaseUserId } = await resolveAuthEmailForParent(
    args.parent,
    args.preferredSupabaseUserId
  );

  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashed =
    linkData?.properties &&
    typeof (linkData.properties as { hashed_token?: string }).hashed_token === "string"
      ? (linkData.properties as { hashed_token: string }).hashed_token
      : null;
  if (linkErr || !hashed) {
    throw Object.assign(
      new Error(linkErr?.message || "Failed to create partner portal session."),
      { statusCode: 503, code: "handoff_mint_failed" }
    );
  }

  const linkedUserId = linkData.user?.id ? String(linkData.user.id) : supabaseUserId;
  if (linkedUserId && !args.parent.supabase_user_id) {
    const sql = getSql();
    await sql`
      UPDATE merchant_parents
      SET supabase_user_id = ${linkedUserId}::uuid
      WHERE id = ${args.parent.id} AND supabase_user_id IS NULL
    `.catch(() => undefined);
  }

  // Anon client for verifyOtp (must pass `ws` on Node < 22 — same as getSupabase()).
  const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: hashed,
    type: "email",
  });
  const accessToken = verified.session?.access_token;
  const refreshToken = verified.session?.refresh_token;
  if (verifyErr || !accessToken || !refreshToken) {
    throw Object.assign(
      new Error(verifyErr?.message || "Failed to verify partner portal session."),
      { statusCode: 503, code: "handoff_verify_failed" }
    );
  }

  return {
    accessToken,
    refreshToken,
    supabaseUserId: linkedUserId ?? supabaseUserId,
  };
}

const usedHandoffJtis = new Map<string, number>();

function pruneUsedHandoffJtis(nowMs = Date.now()) {
  for (const [jti, expMs] of usedHandoffJtis) {
    if (expMs <= nowMs) usedHandoffJtis.delete(jti);
  }
}

export async function signPartnerHandoffToken(args: {
  accessToken: string;
  refreshToken: string;
  next: string;
  parentMerchantId: string;
}): Promise<string> {
  const env = getEnv();
  const key = createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, "utf-8"));
  const exp = Math.floor(Date.now() / 1000) + HANDOFF_TTL_SEC;
  const jti = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  return new SignJWT({
    typ: PARTNER_HANDOFF_TYP,
    at: args.accessToken,
    rt: args.refreshToken,
    next: args.next,
    pid: args.parentMerchantId,
    jti,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .setJti(jti)
    .sign(key);
}

export async function redeemPartnerHandoffToken(token: string): Promise<PartnerHandoffClaims> {
  const env = getEnv();
  const key = createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, "utf-8"));
  const { payload } = await jwtVerify(token, key, { clockTolerance: 5 });
  const typ = String((payload as { typ?: string }).typ ?? "");
  const at = String((payload as { at?: string }).at ?? "");
  const rt = String((payload as { rt?: string }).rt ?? "");
  const next = String((payload as { next?: string }).next ?? "");
  const pid = String((payload as { pid?: string }).pid ?? "");
  const jti = String(payload.jti ?? (payload as { jti?: string }).jti ?? "");
  if (typ !== PARTNER_HANDOFF_TYP || !at || !rt || !next.startsWith("/") || !jti) {
    throw Object.assign(new Error("invalid_handoff_token"), { statusCode: 400 });
  }
  pruneUsedHandoffJtis();
  if (usedHandoffJtis.has(jti)) {
    throw Object.assign(new Error("handoff_token_used"), { statusCode: 400 });
  }
  const expSec = typeof payload.exp === "number" ? payload.exp : Math.floor(Date.now() / 1000) + 60;
  usedHandoffJtis.set(jti, expSec * 1000 + 5_000);
  return { typ: PARTNER_HANDOFF_TYP, at, rt, next, pid };
}

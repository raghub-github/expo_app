/**
 * Cashfree provider config resolution.
 *
 * The active env (sandbox vs production) + rate limit + timeout live in the
 * `verification_provider_configs` DB row. This module reads that row and
 * resolves the credential refs (`env:CASHFREE_SANDBOX_CLIENT_ID`, etc.) into
 * actual credentials via `getEnv()`.
 *
 * Everything is per-call, no module-level cache — the config row can change
 * without a process restart (that's the whole point of putting it in the DB).
 */
import { eq, and } from "drizzle-orm";
import { getDb } from "../../../db/client.js";
import { verificationProviderConfigs } from "../../../db/schema.js";
import { getEnv } from "../../../config/env.js";

export type CashfreeEnv = "sandbox" | "production";

export type CashfreeCredentials = {
  configId: number;
  env: CashfreeEnv;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  apiVersion: string | null;
  timeoutMs: number;
  rateLimitTpm: number;
  /** Which products this credential set has entitlement for (from Cashfree dashboard). */
  enabledProducts: Record<string, boolean>;
  /**
   * Optional RSA public key for `x-cf-signature` (2FA without IP whitelist).
   * From env `CASHFREE_PUBLIC_AUTH_KEY`.
   */
  publicAuthKey: string | null;
};

export class CashfreeNotConfiguredError extends Error {
  constructor(public readonly reason: string) {
    super(`Cashfree not configured: ${reason}`);
    this.name = "CashfreeNotConfiguredError";
  }
}

/**
 * Look up the active Cashfree config.
 *
 * Credential material decides the API host: if the resolved client secret is a
 * Cashfree *production* key (`cfsk_ma_prod_…`) we always call
 * `https://api.cashfree.com/verification`, even when the DB row says sandbox
 * (common local mis-label: prod keys stored under CASHFREE_SANDBOX_*).
 */
export async function loadCashfreeConfig(prefer?: CashfreeEnv): Promise<CashfreeCredentials> {
  const db = getDb();
  const rows = await db
    .select()
    .from(verificationProviderConfigs)
    .where(
      and(
        eq(verificationProviderConfigs.provider, "cashfree"),
        eq(verificationProviderConfigs.isActive, true),
      ),
    );

  if (rows.length === 0) {
    throw new CashfreeNotConfiguredError("no active row in verification_provider_configs");
  }

  const sandboxSecretPeek = resolveRef("env:CASHFREE_SANDBOX_CLIENT_SECRET");
  const prodIdPeek = resolveRef("env:CASHFREE_PROD_CLIENT_ID");
  const prodSecretPeek = resolveRef("env:CASHFREE_PROD_CLIENT_SECRET");
  const secretsLookProd =
    looksLikeProdCashfreeSecret(sandboxSecretPeek) ||
    looksLikeProdCashfreeSecret(prodSecretPeek) ||
    !!prodIdPeek;

  const nodeEnv = String(process.env.NODE_ENV || "development");
  const defaultPrefer: CashfreeEnv | undefined =
    prefer ??
    (secretsLookProd || nodeEnv === "production" ? "production" : "sandbox");

  // Prefer matching env row; if production is preferred but inactive, still
  // fall back to sandbox row and rewrite baseUrl below when secrets are prod.
  const preferred =
    defaultPrefer && rows.find((r) => r.environment === defaultPrefer);
  const chosen =
    preferred ??
    rows.find((r) => r.environment === "production") ??
    rows.find((r) => r.environment === "sandbox") ??
    rows[0];

  if (!chosen) {
    throw new CashfreeNotConfiguredError("no active config row could be selected");
  }

  let env = chosen.environment as CashfreeEnv;
  let baseUrl = chosen.baseUrl;
  let clientId = resolveRef(chosen.credentialRef);
  let clientSecret = chosen.webhookSecretRef
    ? resolveRef(chosen.webhookSecretRef)
    : resolveRef(chosen.credentialRef.replace("CLIENT_ID", "CLIENT_SECRET"));

  // Production row active but PROD_* unset — reuse SANDBOX_* when those hold prod keys.
  if ((!clientId || !clientSecret) && env === "production") {
    const sbId = resolveRef("env:CASHFREE_SANDBOX_CLIENT_ID");
    const sbSecret = resolveRef("env:CASHFREE_SANDBOX_CLIENT_SECRET");
    if (looksLikeProdCashfreeSecret(sbSecret)) {
      clientId = clientId || sbId;
      clientSecret = clientSecret || sbSecret;
    }
  }

  if (!clientId || !clientSecret) {
    throw new CashfreeNotConfiguredError(
      `credential env vars missing for cashfree/${env}: id=${clientId ? "ok" : "missing"}, secret=${clientSecret ? "ok" : "missing"}`,
    );
  }

  // Prod secret against sandbox host → Cashfree returns
  // "Client secret belongs to prod environment". Rewrite host.
  if (looksLikeProdCashfreeSecret(clientSecret) && /sandbox\.cashfree\.com/i.test(baseUrl)) {
    console.warn(
      "[cashfree] production client secret detected with sandbox base URL — using production verification host",
    );
    env = "production";
    baseUrl = "https://api.cashfree.com/verification";
  } else if (
    !looksLikeProdCashfreeSecret(clientSecret) &&
    /api\.cashfree\.com/i.test(baseUrl) &&
    /sandbox|test/i.test(clientSecret)
  ) {
    console.warn(
      "[cashfree] sandbox client secret detected with production base URL — using sandbox verification host",
    );
    env = "sandbox";
    baseUrl = "https://sandbox.cashfree.com/verification";
  }

  const publicAuthKey = resolvePublicAuthKey();

  return {
    configId: chosen.id,
    env,
    baseUrl,
    clientId,
    clientSecret,
    apiVersion: chosen.apiVersion,
    timeoutMs: chosen.timeoutMs,
    rateLimitTpm: chosen.rateLimitTpm,
    enabledProducts: (chosen.enabledProducts as Record<string, boolean>) ?? {},
    publicAuthKey,
  };
}

/** Cashfree marks prod secrets with `cfsk_ma_prod_` (and similar) prefixes. */
function looksLikeProdCashfreeSecret(secret: string | null | undefined): boolean {
  if (!secret) return false;
  const s = secret.trim().toLowerCase();
  return s.includes("cfsk_ma_prod") || s.includes("_prod_") || s.startsWith("cfsk_prod");
}

/**
 * Resolve a `credential_ref` string into a secret value.
 *
 *   env:CASHFREE_SANDBOX_CLIENT_ID   → process.env / getEnv() lookup
 *   vault:<path>                     → future — a real secret manager integration
 */
function resolveRef(ref: string): string | null {
  if (!ref) return null;
  if (ref.startsWith("env:")) {
    const name = ref.slice("env:".length);
    try {
      const env = getEnv() as unknown as Record<string, unknown>;
      const v = env[name];
      if (typeof v === "string" && v.length > 0) return v;
    } catch {
      // getEnv can throw if unrelated vars fail validation — fall through to process.env
    }
    const raw = process.env[name];
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  }
  // Vault etc. can be added here later without changing call sites.
  return null;
}

function resolvePublicAuthKey(): string | null {
  try {
    const env = getEnv();
    if (env.CASHFREE_PUBLIC_AUTH_KEY?.trim()) return env.CASHFREE_PUBLIC_AUTH_KEY.trim();
  } catch {
    /* fall through */
  }
  const raw = process.env.CASHFREE_PUBLIC_AUTH_KEY;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

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
};

export class CashfreeNotConfiguredError extends Error {
  constructor(public readonly reason: string) {
    super(`Cashfree not configured: ${reason}`);
    this.name = "CashfreeNotConfiguredError";
  }
}

/**
 * Look up the active Cashfree config. Prefers `production` (is_active=true);
 * falls back to `sandbox` (is_active=true).
 *
 * A misconfigured deploy fails LOUD: if only sandbox is active in NODE_ENV=production,
 * caller sees CashfreeNotConfiguredError and can decide whether to allow it.
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

  const preferred =
    prefer && rows.find((r) => r.environment === prefer);
  const chosen =
    preferred ??
    rows.find((r) => r.environment === "production") ??
    rows.find((r) => r.environment === "sandbox") ??
    rows[0];

  if (!chosen) {
    throw new CashfreeNotConfiguredError("no active config row could be selected");
  }

  const env = chosen.environment as CashfreeEnv;
  const clientId = resolveRef(chosen.credentialRef);
  // Cashfree uses the same client_secret for API auth AND webhook HMAC — so
  // the webhook secret ref *should* point to the same env var. If it doesn't,
  // we still respect what the ops team configured.
  const clientSecret = chosen.webhookSecretRef
    ? resolveRef(chosen.webhookSecretRef)
    : resolveRef(chosen.credentialRef.replace("CLIENT_ID", "CLIENT_SECRET"));

  if (!clientId || !clientSecret) {
    throw new CashfreeNotConfiguredError(
      `credential env vars missing for cashfree/${env}: id=${clientId ? "ok" : "missing"}, secret=${clientSecret ? "ok" : "missing"}`,
    );
  }

  return {
    configId: chosen.id,
    env,
    baseUrl: chosen.baseUrl,
    clientId,
    clientSecret,
    apiVersion: chosen.apiVersion,
    timeoutMs: chosen.timeoutMs,
    rateLimitTpm: chosen.rateLimitTpm,
    enabledProducts: (chosen.enabledProducts as Record<string, boolean>) ?? {},
  };
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
    const env = getEnv() as unknown as Record<string, unknown>;
    const v = env[name];
    return typeof v === "string" && v.length > 0 ? v : null;
  }
  // Vault etc. can be added here later without changing call sites.
  return null;
}

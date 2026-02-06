/**
 * Shared auth/session error detection for API routes.
 * Used by session, permissions, and dashboard-access to return 503 on transient errors
 * so the client retries instead of showing "Not authenticated" or hanging.
 */

export function isInvalidRefreshToken(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string };
  return (
    e.code === "refresh_token_already_used" ||
    e.message?.includes("refresh_token_already_used") ||
    (e.message ?? "").toLowerCase().includes("invalid refresh token")
  );
}

/** Supabase Auth rate limit (429). Do not retry in a loop – return 503 and let client retry after delay. */
export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; code?: string };
  return e.status === 429 || e.code === "over_request_rate_limit";
}

/** Get deepest cause code (undici/Node fetch use cause chains, e.g. ConnectTimeoutError). */
function getCauseCode(err: unknown): string | undefined {
  let e: unknown = err;
  let code: string | undefined;
  for (let i = 0; i < 5 && e && typeof e === "object"; i++) {
    const o = e as { code?: string; cause?: unknown };
    if (o.code) code = o.code;
    e = o.cause;
  }
  return code;
}

/**
 * Network/transient errors: Supabase unreachable, DNS, timeout.
 * Return 503 so client retries instead of logging out or showing "Not authenticated".
 * Includes undici codes: UND_ERR_CONNECT_TIMEOUT, etc.
 */
export function isNetworkOrTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string; cause?: unknown };
  const msg = (e.message ?? "").toLowerCase();
  if (
    msg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("connect timeout")
  )
    return true;
  const code = getCauseCode(err) ?? e.code;
  return (
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET_TIMEOUT" ||
    (typeof code === "string" && code.startsWith("UND_ERR_"))
  );
}

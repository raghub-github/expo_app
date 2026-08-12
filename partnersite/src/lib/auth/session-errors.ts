/**
 * Shared auth/session error detection for API routes.
 */

/** Concurrent refresh race — another request already rotated the token. Do NOT clear cookies. */
export function isRefreshTokenAlreadyUsed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string };
  const message = (e.message ?? "").toLowerCase();
  return (
    e.code === "refresh_token_already_used" ||
    e.message?.includes("refresh_token_already_used") === true ||
    message.includes("already used")
  );
}

/** Any refresh-token related error (includes concurrent race). */
export function isInvalidRefreshToken(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if (isRefreshTokenAlreadyUsed(err)) return true;
  const e = err as { message?: string; code?: string };
  const message = (e.message ?? "").toLowerCase();
  return (
    e.code === "refresh_token_not_found" ||
    e.code === "invalid_refresh_token" ||
    e.message?.includes("refresh_token_not_found") === true ||
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    (message.includes("invalid") && message.includes("refresh") && message.includes("token"))
  );
}

/**
 * Truly unrecoverable refresh failure (not a concurrent race).
 * Only these should clear this browser's cookies — never call supabase.auth.signOut() on read paths.
 */
export function isFatalRefreshTokenError(err: unknown): boolean {
  return isInvalidRefreshToken(err) && !isRefreshTokenAlreadyUsed(err);
}

export function isNetworkOrTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if (isRefreshTokenAlreadyUsed(err)) return true;
  const e = err as { message?: string; code?: string; status?: number; cause?: unknown };
  if (e.status === 408 || e.status === 0) return true;
  const msg = (e.message ?? "").toLowerCase();
  if (
    msg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("connect timeout") ||
    msg.includes("timeout") ||
    msg.includes("abort") ||
    msg.includes("the operation was aborted") ||
    msg.includes("request_timeout") ||
    msg.includes("upstream timeout")
  )
    return true;
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    const o = current as { code?: string; cause?: unknown };
    if (
      o.code &&
      typeof o.code === "string" &&
      (o.code.startsWith("UND_ERR_") ||
        ["ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(o.code))
    )
      return true;
    current = o.cause;
  }
  return false;
}

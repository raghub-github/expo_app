/**
 * Shared auth/session error detection for API routes.
 */

export function isInvalidRefreshToken(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string };
  const message = (e.message ?? "").toLowerCase();
  return (
    e.code === "refresh_token_already_used" ||
    e.code === "refresh_token_not_found" ||
    e.message?.includes("refresh_token_already_used") ||
    e.message?.includes("refresh_token_not_found") ||
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("already used") ||
    (message.includes("invalid") && message.includes("refresh") && message.includes("token"))
  );
}

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
    msg.includes("connect timeout") ||
    msg.includes("timeout") ||
    msg.includes("abort") ||
    msg.includes("the operation was aborted")
  )
    return true;
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    const o = current as { code?: string; cause?: unknown };
    if (o.code && typeof o.code === "string" && (o.code.startsWith("UND_ERR_") || ["ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"].includes(o.code)))
      return true;
    current = o.cause;
  }
  return false;
}

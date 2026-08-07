/**
 * Shared auth/session error detection for API routes.
 * Used by session, permissions, and dashboard-access to return 503 on transient errors
 * so the client retries instead of showing "Not authenticated" or hanging.
 */

function authErrorParts(err: unknown): { message: string; code: string; name: string } {
  if (!err || typeof err !== "object") return { message: "", code: "", name: "" };
  const e = err as { message?: string; code?: string; name?: string };
  return {
    message: (e.message ?? "").toLowerCase(),
    code: e.code ?? "",
    name: e.name ?? "",
  };
}

/**
 * Parallel getUser()/getSession() races often yield "refresh_token_already_used".
 * That means another request already rotated the token — do NOT signOut or you
 * will wipe the cookies the winning request just wrote (instant auto-logout).
 */
export function isRefreshTokenAlreadyUsed(err: unknown): boolean {
  const { message, code } = authErrorParts(err);
  return (
    code === "refresh_token_already_used" ||
    message.includes("refresh_token_already_used") ||
    (message.includes("refresh") && message.includes("already used"))
  );
}

/** Server/client has no cookie session yet — common during first set-cookie after OAuth. */
export function isAuthSessionMissingError(err: unknown): boolean {
  const { message, name } = authErrorParts(err);
  return (
    name === "authsessionmissingerror" ||
    message.includes("auth session missing") ||
    message.includes("session missing")
  );
}

/** Refresh token is gone / revoked — session cannot be recovered. */
export function isRefreshTokenNotFound(err: unknown): boolean {
  const { message, code } = authErrorParts(err);
  return (
    code === "refresh_token_not_found" ||
    message.includes("refresh_token_not_found") ||
    message.includes("refresh token not found")
  );
}

/**
 * Any refresh-token failure (already used, not found, or invalid).
 * Use for branching response codes; use shouldClearAuthSession before signOut.
 */
export function isInvalidRefreshToken(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if (isRefreshTokenAlreadyUsed(err) || isRefreshTokenNotFound(err)) return true;
  const { message, name } = authErrorParts(err);
  return (
    (name === "AuthApiError" &&
      message.includes("refresh") &&
      (message.includes("not found") || message.includes("invalid"))) ||
    message.includes("invalid refresh token") ||
    (message.includes("invalid") && message.includes("refresh") && message.includes("token"))
  );
}

/**
 * Only clear cookies for irrecoverable refresh failures.
 * Never clear on already_used — that is a parallel-refresh race.
 * Never clear on refresh_token_not_found from API handlers either:
 * another parallel request may have already rotated cookies; signing out
 * here wipes the winner's session and causes logout loops.
 * Explicit logout (/api/auth/logout) is the only safe place to clear cookies.
 */
export function shouldClearAuthSession(err: unknown): boolean {
  if (!isInvalidRefreshToken(err)) return false;
  if (isRefreshTokenAlreadyUsed(err)) return false;
  if (isRefreshTokenNotFound(err)) return false;
  return true;
}

/**
 * Sign out only when the refresh token is truly dead.
 * Returns true if signOut was attempted.
 */
export async function signOutIfSessionDead(
  supabase: { auth: { signOut: () => Promise<unknown> } },
  err: unknown
): Promise<boolean> {
  if (!shouldClearAuthSession(err)) return false;
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  return true;
}

/** True when an API error code means the browser session is dead (hard logout). */
export function isHardSessionDeathCode(code: string | undefined | null): boolean {
  const c = String(code ?? "").toUpperCase();
  return c === "SESSION_INVALID" || c === "SESSION_EXPIRED";
}

/** Transient auth/network failures — return 503, never logout. */
export function isTransientAuthError(err: unknown): boolean {
  return isTimeoutOrAbortError(err) || isNetworkOrTransientError(err);
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

/** True if error is timeout/abort (do not retry – Supabase unreachable). */
export function isTimeoutOrAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string; name?: string };
  const name = (e.name ?? "").toLowerCase();
  const msg = (e.message ?? "").toLowerCase();
  if (name === "aborterror" || msg.includes("aborted")) return true;
  const code = getCauseCode(err) ?? e.code;
  return (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET_TIMEOUT" ||
    code === "ETIMEDOUT"
  );
}

/**
 * Network/transient errors: Supabase unreachable, DNS, timeout.
 * Return 503 so client retries instead of logging out or showing "Not authenticated".
 * Includes undici codes: UND_ERR_CONNECT_TIMEOUT, AbortError (our fetch timeout), etc.
 */
export function isNetworkOrTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string; name?: string; cause?: unknown };
  const msg = (e.message ?? "").toLowerCase();
  const name = (e.name ?? "").toLowerCase();
  if (
    name === "aborterror" ||
    msg.includes("aborted") ||
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

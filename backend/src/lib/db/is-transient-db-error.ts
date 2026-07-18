/** True for pool/connection errors that should not tear down the API process. */
export function isTransientDbError(reason: unknown): boolean {
  if (!reason) return false;

  const codes = collectPostgresCodes(reason);
  const transientCodes = new Set([
    "XX000", // Supabase pooler checkout timeout / handler exited
    "57014", // statement_timeout
    "08006", // connection_failure
    "08003", // connection_does_not_exist
    "57P01", // admin_shutdown
    "53300", // too_many_connections
    "ENOTFOUND", // DNS blip (VPN / flaky resolvers)
    "EAI_AGAIN", // temporary DNS failure
    "ENETUNREACH",
    "EHOSTUNREACH",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "ECONNRESET",
    "CONNECT_TIMEOUT", // postgres.js connect timeout to pooler
    "CONNECTION_DESTROYED",
    "CONNECTION_CLOSED",
  ]);
  if (codes.some((c) => transientCodes.has(c))) return true;

  const msg = collectErrorMessages(reason).join(" ").toLowerCase();
  return (
    msg.includes("database_slot_timeout") ||
    msg.includes("connection_destroyed") ||
    msg.includes("echeckouttimeout") ||
    msg.includes("edbhandlerexited") ||
    msg.includes("connection to database closed") ||
    msg.includes("unable to check out connection") ||
    msg.includes("connection terminated") ||
    msg.includes("connect econnrefused") ||
    msg.includes("connect etimedout") ||
    msg.includes("connect_timeout") ||
    msg.includes("getaddrinfo enotfound") ||
    msg.includes("getaddrinfo eai_again") ||
    msg.includes("write connection_closed")
  );
}

/** Walk error.cause chains (Drizzle wraps pool failures as "Failed query: …"). */
export function hasTransientDbCause(err: unknown, depth = 0): boolean {
  if (!err || depth > 8) return false;
  if (isTransientDbError(err) || isConnectionErr(err)) return true;
  if (typeof err !== "object") return false;
  const cause = (err as { cause?: unknown }).cause;
  return cause ? hasTransientDbCause(cause, depth + 1) : false;
}

function isConnectionErr(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: string; message?: string };
  const code = String(e.code ?? e.errno ?? "");
  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ENETUNREACH" ||
    code === "EHOSTUNREACH" ||
    code === "ETIMEDOUT" ||
    code === "CONNECT_TIMEOUT" ||
    code === "CONNECTION_DESTROYED" ||
    code === "57P01" ||
    code === "08006" ||
    code === "CONNECTION_CLOSED" ||
    code === "XX000"
  ) {
    return true;
  }
  const msg = String(e.message ?? "").toLowerCase();
  return (
    msg.includes("connection_closed") ||
    msg.includes("connection_destroyed") ||
    msg.includes("connect_timeout") ||
    msg.includes("getaddrinfo enotfound") ||
    msg.includes("getaddrinfo eai_again") ||
    msg.includes("write connection_closed")
  );
}

function collectPostgresCodes(err: unknown, depth = 0): string[] {
  if (!err || typeof err !== "object" || depth > 4) return [];
  const e = err as { code?: unknown; errno?: unknown; cause?: unknown };
  const out: string[] = [];
  if (typeof e.code === "string" && e.code.trim()) out.push(e.code.trim());
  if (typeof e.errno === "string" && e.errno.trim()) out.push(e.errno.trim());
  if (e.cause) out.push(...collectPostgresCodes(e.cause, depth + 1));
  return out;
}

function collectErrorMessages(err: unknown, depth = 0): string[] {
  if (!err || depth > 4) return [];
  if (typeof err === "string") return [err];
  if (typeof err !== "object") return [];
  const e = err as { message?: unknown; cause?: unknown };
  const out: string[] = [];
  if (typeof e.message === "string") out.push(e.message);
  if (e.cause) out.push(...collectErrorMessages(e.cause, depth + 1));
  return out;
}

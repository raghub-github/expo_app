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
  ]);
  if (codes.some((c) => transientCodes.has(c))) return true;

  const msg = collectErrorMessages(reason).join(" ").toLowerCase();
  return (
    msg.includes("echeckouttimeout") ||
    msg.includes("edbhandlerexited") ||
    msg.includes("connection to database closed") ||
    msg.includes("unable to check out connection") ||
    msg.includes("connection terminated") ||
    msg.includes("connect econnrefused") ||
    msg.includes("connect etimedout")
  );
}

function collectPostgresCodes(err: unknown, depth = 0): string[] {
  if (!err || typeof err !== "object" || depth > 4) return [];
  const e = err as { code?: unknown; cause?: unknown };
  const out: string[] = [];
  if (typeof e.code === "string" && e.code.trim()) out.push(e.code.trim());
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

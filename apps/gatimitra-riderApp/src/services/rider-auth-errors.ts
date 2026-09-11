import { notifySessionRevoked } from "@/src/services/sessionEvents";
import { isDefiniteRiderSessionRevocation } from "@/src/services/rider-auth-failure";

export function parseApiErrorCode(body?: string | null): string | undefined {
  if (!body?.trim()) return undefined;
  try {
    const parsed = JSON.parse(body) as { error?: string };
    const code = parsed.error?.trim();
    return code || undefined;
  } catch {
    return undefined;
  }
}

export function parseApiErrorMessage(body?: string | null): string {
  if (!body?.trim()) return "";
  try {
    const parsed = JSON.parse(body) as { message?: string };
    return typeof parsed.message === "string" ? parsed.message.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Match merchant app: only explicit auth revocation should even SIGNAL sign-out — and the signal is
 * still confirmed authoritatively (SessionRevokedGate → confirmStillValid) before the session is
 * actually cleared, so a single transient/racy 401 during cold start never logs the rider out.
 */
export function notifyForceLogoutIfNeeded(status: number, body?: string | null): void {
  const code = parseApiErrorCode(body);
  const msg = parseApiErrorMessage(body);
  if (!isDefiniteRiderSessionRevocation(status, code, msg)) return;
  notifySessionRevoked({ reason: code === "invalid_token" ? "invalid_token" : "revoked" });
}

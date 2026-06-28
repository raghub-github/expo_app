import { notifySessionRevoked } from "@/src/services/sessionEvents";

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

/** Match merchant app: only explicit auth revocation should force sign-out. */
export function notifyForceLogoutIfNeeded(status: number, body?: string | null): void {
  if (status !== 401) return;
  const code = parseApiErrorCode(body);
  const msg = parseApiErrorMessage(body);
  if (code === "invalid_token") {
    notifySessionRevoked({ reason: "invalid_token" });
    return;
  }
  if (code === "session_revoked") {
    const isForcedDeviceLogout =
      msg.includes("Signed out from all devices") ||
      msg.includes("Signed out from this device");
    if (isForcedDeviceLogout) {
      notifySessionRevoked({ reason: "revoked" });
    }
  }
}

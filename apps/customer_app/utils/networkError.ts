/**
 * Detect network/connection failures and return a user-friendly message.
 * Use when API calls fail so we can suggest EXPO_PUBLIC_DEV_HOST / backend running.
 */

const NETWORK_CODES = ["ECONNREFUSED", "ERR_NETWORK", "ETIMEDOUT", "ECONNABORTED"];

export function isNetworkError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code && NETWORK_CODES.includes(e.code)) return true;
  const msg = (e?.message ?? "").toLowerCase();
  return msg.includes("network error") || msg.includes("failed to fetch") || msg.includes("load failed");
}

const DEV_HOST_HINT =
  "On a physical device, set EXPO_PUBLIC_DEV_HOST to your PC's IP (e.g. 192.168.1.5) in .env and restart the app. Ensure the backend is running (npm run dev in backend/).";

export function getNetworkErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const raw = e?.message ?? "Cannot reach server.";
  if (!isNetworkError(err)) return raw;
  return `${raw} ${DEV_HOST_HINT}`;
}

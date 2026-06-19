/**
 * Detect network/connection failures and return a user-friendly message.
 * Use when API calls fail so we can suggest EXPO_PUBLIC_DEV_HOST / backend running.
 */

const NETWORK_CODES = ["ECONNREFUSED", "ERR_NETWORK", "ETIMEDOUT", "ECONNABORTED"];

export function isNetworkError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code && NETWORK_CODES.includes(e.code)) return true;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    msg.includes("network error") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  );
}

/** Safe to retry checkout placement calls (pending / Razorpay order / finalize). */
export function isRetriableCheckoutError(err: unknown): boolean {
  if (isNetworkError(err)) return true;
  const e = err as { response?: { status?: number; data?: { error?: string } } };
  return e?.response?.status === 500 && e?.response?.data?.error === "ORDER_CREATION_FAILED";
}

const DEV_HOST_HINT =
  "Use the same port as backend (default 3000). On a phone, set EXPO_PUBLIC_DEV_HOST to your PC's LAN IP in .env, run `npx expo start --clear`, and rebuild the Android app after native config changes. Backend: npm run dev in backend/.";

export function getNetworkErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const raw = e?.message ?? "Cannot reach server.";
  if (!isNetworkError(err)) return raw;
  return `${raw} ${DEV_HOST_HINT}`;
}

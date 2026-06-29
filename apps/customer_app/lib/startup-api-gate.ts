/**
 * Limits parallel API calls during cold start so the dev backend / Supabase pool
 * is not flooded (avoids axios "Network Error" from connection timeouts).
 */

let startupEndsAt = Date.now() + 25_000;
let inFlight = 0;
const waiters: Array<() => void> = [];

const MAX_PARALLEL = 3;

const GATE_BYPASS_URL_PARTS = ["/v1/me/wallet"];

export function shouldBypassStartupGate(url: string | undefined): boolean {
  if (!url) return false;
  return GATE_BYPASS_URL_PARTS.some((part) => url.includes(part));
}

export function resetStartupApiGateForTests(): void {
  startupEndsAt = Date.now() + 25_000;
  inFlight = 0;
  waiters.length = 0;
}

export async function enterStartupApiGate(requestUrl?: string): Promise<void> {
  if (shouldBypassStartupGate(requestUrl)) return;
  if (Date.now() > startupEndsAt) return;

  if (inFlight >= MAX_PARALLEL) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  inFlight++;
}

export function leaveStartupApiGate(requestUrl?: string): void {
  if (shouldBypassStartupGate(requestUrl)) return;
  if (Date.now() > startupEndsAt) return;
  inFlight = Math.max(0, inFlight - 1);
  const next = waiters.shift();
  if (next) next();
}

/** @deprecated Use enter/leaveStartupApiGate from axios interceptors */
export async function gateStartupApiCall<T>(fn: () => Promise<T>): Promise<T> {
  await enterStartupApiGate();
  try {
    return await fn();
  } finally {
    leaveStartupApiGate();
  }
}

/** Extend gate after login prefetch burst. */
export function extendStartupApiGate(ms = 10_000): void {
  startupEndsAt = Math.max(startupEndsAt, Date.now() + ms);
}

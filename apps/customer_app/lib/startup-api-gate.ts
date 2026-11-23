/**
 * Limits parallel API calls during cold start so the dev backend / Supabase pool
 * is not flooded (avoids axios "Network Error" from connection timeouts).
 *
 * Keep the window short — a 25s / 15s queue was a primary cause of 30s+ home loads.
 * Home-critical reads bypass the gate entirely.
 */

let startupEndsAt = Date.now() + 8_000;
let inFlight = 0;
const waiters: Array<() => void> = [];

const MAX_PARALLEL = 6;
/** A queued request is never held longer than this, even if releases are lost. */
const MAX_WAIT_MS = 2_500;

/** Wallet + item customization must never sit behind the cold-start queue. */
const GATE_BYPASS_URL_PARTS = [
  "/v1/me/wallet",
  "/full-config",
  "/v1/billing/calculate",
  // Book screens must not wait behind home-layout / offers storms.
  "/v1/parcel/quote-batch",
  "/v1/rides/quote-batch",
  // Select-location saved list must never queue behind home/layout prefetch.
  "/v1/me/addresses",
  "/v1/me/active-location",
  // OTP → home must not queue behind cold-start prefetch (spinner feels stuck).
  "/v1/me/profile",
  "/v1/me/legal-consent",
  "/v1/auth/otp/",
  "/v1/auth/supabase/exchange-customer",
  // Home first paint — never serialize these behind the gate.
  "/v1/offers",
  "/v1/featured",
  "/v1/geo/",
  "/v1/customer/geo",
  "/v1/weather",
  "/v1/app-assets",
  "/v1/me/service-blocks",
  "/v1/customer/service-blocks",
  "/v1/home",
  "/v1/merchants/nearby",
  "/v1/grocery",
];

export function shouldBypassStartupGate(url: string | undefined): boolean {
  if (!url) return false;
  return GATE_BYPASS_URL_PARTS.some((part) => url.includes(part));
}

export function resetStartupApiGateForTests(): void {
  startupEndsAt = Date.now() + 8_000;
  inFlight = 0;
  waiters.length = 0;
}

function releaseNextWaiter(): void {
  const next = waiters.shift();
  if (next) next();
}

/**
 * Resolves to true when the caller occupied a slot, so the response
 * interceptor knows whether it owes a `leaveStartupApiGate` call.
 */
export async function enterStartupApiGate(requestUrl?: string): Promise<boolean> {
  if (shouldBypassStartupGate(requestUrl)) return false;
  if (Date.now() > startupEndsAt) return false;

  if (inFlight >= MAX_PARALLEL) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const release = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      // Without this, a release lost after the startup window would strand the
      // request forever and its caller would never see success or failure.
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(release);
        if (idx >= 0) waiters.splice(idx, 1);
        release();
      }, MAX_WAIT_MS);
      waiters.push(release);
    });
  }
  inFlight++;
  return true;
}

export function leaveStartupApiGate(requestUrl?: string): void {
  if (shouldBypassStartupGate(requestUrl)) return;
  // Deliberately not gated on `startupEndsAt`: slow startup requests finish
  // after the window closes and must still hand their slot to the queue.
  inFlight = Math.max(0, inFlight - 1);
  releaseNextWaiter();
}

/** @deprecated Use enter/leaveStartupApiGate from axios interceptors */
export async function gateStartupApiCall<T>(fn: () => Promise<T>): Promise<T> {
  const entered = await enterStartupApiGate();
  try {
    return await fn();
  } finally {
    if (entered) leaveStartupApiGate();
  }
}

/** Extend gate after login prefetch burst. */
export function extendStartupApiGate(ms = 10_000): void {
  startupEndsAt = Math.max(startupEndsAt, Date.now() + ms);
}

/**
 * End the cold-start concurrency gate (Home shell / splash exit).
 * In-flight requests still release slots via leaveStartupApiGate.
 */
export function endStartupApiGate(): void {
  startupEndsAt = 0;
  while (waiters.length) {
    releaseNextWaiter();
  }
}

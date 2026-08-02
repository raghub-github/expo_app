/**
 * Limits parallel API calls during cold start so the dev backend / Supabase pool
 * is not flooded (avoids axios "Network Error" from connection timeouts).
 */

let startupEndsAt = Date.now() + 25_000;
let inFlight = 0;
const waiters: Array<() => void> = [];

const MAX_PARALLEL = 3;
/** A queued request is never held longer than this, even if releases are lost. */
const MAX_WAIT_MS = 15_000;

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

/**
 * Dev-only tracking logs. No-ops in production builds.
 */

type LogPayload = Record<string, unknown>;

function enabled(): boolean {
  try {
    // Metro / Expo set __DEV__; Node tests won't.
    return typeof __DEV__ !== "undefined" ? Boolean(__DEV__) : process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

export function trackDebug(event: string, payload?: LogPayload): void {
  if (!enabled()) return;
  if (payload) {
    console.log(`[live-track] ${event}`, payload);
  } else {
    console.log(`[live-track] ${event}`);
  }
}

declare const __DEV__: boolean | undefined;

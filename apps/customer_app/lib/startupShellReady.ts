/**
 * Cold-start shell gate: keep the branded splash covering until the first real
 * destination (Home / Login / Onboarding) has painted. Prevents the blank mint
 * flash between splash fade and Home mount.
 *
 * Module bridge + React subscription — RootLayout owns the boolean via
 * useSyncExternalStore so Fast Refresh remounts start clean without racing
 * Strict Mode double-effects against a sticky true flag.
 */

import { useCallback, useSyncExternalStore } from "react";
import { startupMeasure } from "@/lib/startupPerf";
import { isSplashDeadlineHit, isSplashExited } from "@/lib/splashLifecycle";

let shellReady = false;
let shellReadyReason: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function markInitialShellReady(reason: string): void {
  if (shellReady) return;
  shellReady = true;
  shellReadyReason = reason;
  startupMeasure("initial_shell_ready", "process_start");
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[startup-perf] shell_ready_reason=", reason);
  }
  emit();
}

export function isInitialShellReady(): boolean {
  return shellReady;
}

export function getInitialShellReadyReason(): string | null {
  return shellReadyReason;
}

/**
 * Clear for a new RootLayout instance.
 * @param opts.silent — no listener emit (required when clearing during render
 *   before useSyncExternalStore subscribe, to avoid "update while rendering").
 */
export function resetInitialShellReady(
  reason = "reset",
  opts?: { silent?: boolean }
): void {
  // Never wipe shell-ready after splash has armed/exited — Fast Refresh used to
  // clear this mid-launch and re-cover Home with mint for tens of seconds.
  if (isSplashExited() || isSplashDeadlineHit()) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[startup-perf] shell_ready_reset_skipped=", reason);
    }
    return;
  }
  if (!shellReady && shellReadyReason == null) return;
  shellReady = false;
  shellReadyReason = null;
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[startup-perf] shell_ready_reset=", reason);
  }
  if (!opts?.silent) emit();
}

/** @deprecated use resetInitialShellReady */
export function resetInitialShellReadyForTests(): void {
  resetInitialShellReady("tests");
}

export function useInitialShellReady(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    () => shellReady,
    () => shellReady
  );
}

/** RootLayout: reset once before children paint, then subscribe. */
export function useStartupShellGate(): {
  shellReady: boolean;
  markShellReady: (reason: string) => void;
} {
  const ready = useInitialShellReady();
  const markShellReady = useCallback((reason: string) => {
    markInitialShellReady(reason);
  }, []);
  return { shellReady: ready, markShellReady };
}

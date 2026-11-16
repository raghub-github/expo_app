/**
 * Cold-start shell gate: keep the branded splash covering until the first real
 * destination (Home / Login / Onboarding) has committed. Prevents the blank mint
 * flash between splash fade and Home mount.
 *
 * Survives Fast Refresh via globalThis — a module `let` used to be wiped on
 * RootLayout remount AFTER Home had marked ready but BEFORE splash exited, which
 * left the branded cover up for many seconds with no re-mark from surviving Home.
 */

import { useCallback, useSyncExternalStore } from "react";
import { startupLaunchLog, startupMeasure } from "@/lib/startupPerf";
import {
  isSplashDeadlineHit,
  isSplashExited,
  markSplashExited,
} from "@/lib/splashLifecycle";

type ShellGlobal = {
  __gatimitraShellReady?: {
    ready: boolean;
    reason: string | null;
    readyAtMs: number | null;
    listeners: Set<() => void>;
  };
};

function store() {
  const g = globalThis as ShellGlobal;
  if (!g.__gatimitraShellReady) {
    g.__gatimitraShellReady = {
      ready: false,
      reason: null,
      readyAtMs: null,
      listeners: new Set(),
    };
  }
  return g.__gatimitraShellReady;
}

function emit() {
  store().listeners.forEach((l) => l());
}

export function markInitialShellReady(reason: string): void {
  const s = store();
  if (s.ready) return;
  s.ready = true;
  s.reason = reason;
  s.readyAtMs = Date.now();
  startupMeasure("initial_shell_ready", "process_start");
  startupLaunchLog("INITIAL_SHELL_READY", {
    reason,
    blocksHome: true,
  });
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[startup-perf] shell_ready_reason=", reason);
  }
  // Shell ready only means Home/Login chrome is mounted. Branded cover dismiss is
  // owned by RootLayout `destinationCommitted` (left Index after auth) so splash
  // never waits on Metro/Home JS — that wait hid skeletons under a 30s mint cover.
  if (!isSplashExited()) {
    const first = markSplashExited(`shell_ready:${reason}`);
    if (first) {
      startupMeasure("branding_splash_exit", "process_start");
      startupMeasure("splash_visible_duration", "branding_visible");
      startupMeasure("usable_home_ready", "process_start");
      startupLaunchLog("BRANDED_SPLASH_DISMISS", {
        reason: `shell_ready:${reason}`,
        blocksHome: false,
        sync: true,
      });
    }
  }
  emit();
}

export function isInitialShellReady(): boolean {
  return store().ready;
}

export function getInitialShellReadyReason(): string | null {
  return store().reason;
}

/**
 * Clear for a true cold RootLayout construct only.
 * Once shell has been ready this process, NEVER wipe — remount resets were the
 * root cause of multi-second branded-cover holds after Home was already up.
 */
export function resetInitialShellReady(
  reason = "reset",
  opts?: { silent?: boolean }
): void {
  const s = store();
  if (s.ready || isSplashExited() || isSplashDeadlineHit()) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[startup-perf] shell_ready_reset_skipped=", reason, {
        ready: s.ready,
        splashExited: isSplashExited(),
      });
    }
    return;
  }
  if (!s.ready && s.reason == null) return;
  s.ready = false;
  s.reason = null;
  s.readyAtMs = null;
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[startup-perf] shell_ready_reset=", reason);
  }
  if (!opts?.silent) emit();
}

/** @deprecated use resetInitialShellReady */
export function resetInitialShellReadyForTests(): void {
  const s = store();
  s.ready = false;
  s.reason = null;
  s.readyAtMs = null;
  emit();
}

export function useInitialShellReady(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const s = store();
      s.listeners.add(onStoreChange);
      return () => {
        s.listeners.delete(onStoreChange);
      };
    },
    () => store().ready,
    () => store().ready
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

/**
 * Absolute splash lifecycle — survives Fast Refresh via globalThis.
 *
 * Root cause of 30–40s mint holds in DEV: RootLayout remounts reset module
 * `let` flags, wiped shell-ready, and re-armed the branded overlay while Metro
 * was still bundling. Production never HMR-remounts, but the same wall-clock
 * deadline still guarantees ≤5s splash even when auth/shell signals lag.
 */

import { useSyncExternalStore } from "react";
import { startupLaunchLog, startupProcessAgeMs } from "@/lib/startupPerf";

/**
 * Absolute auth-unblock + destination-kick budget. Root layout must NOT dismiss
 * the branded cover onto root Index mint — only Home/Login/Onboarding mark shell.
 */
export const SPLASH_HARD_DEADLINE_MS = 5_000;
/**
 * Watchdog after auth for shell-ready lag logging.
 */
export const SPLASH_SHELL_SOFT_MS = 400;

type SplashLifecycleState = {
  processStartMs: number;
  exited: boolean;
  deadlineHit: boolean;
  armed: boolean;
};

type SplashGlobal = {
  __gatimitraSplashLifecycle?: SplashLifecycleState & {
    listeners: Set<() => void>;
    deadlineTimer: ReturnType<typeof setTimeout> | null;
  };
};

function store() {
  const g = globalThis as SplashGlobal;
  if (!g.__gatimitraSplashLifecycle) {
    g.__gatimitraSplashLifecycle = {
      processStartMs: Date.now(),
      exited: false,
      deadlineHit: false,
      armed: false,
      listeners: new Set(),
      deadlineTimer: null,
    };
    startupLaunchLog("APP_LAUNCH", { t: 0 });
  }
  return g.__gatimitraSplashLifecycle;
}

/**
 * Metro Fast Refresh reuses globalThis. If a previous session already dismissed
 * splash, a remount must not pretend this is a fresh cold launch with a dead
 * deadline — but it also must not re-cover Home. Callers use isSplashExited().
 */

function emit() {
  store().listeners.forEach((l) => l());
}

function armHardDeadlineOnce() {
  const s = store();
  if (s.deadlineTimer != null || s.deadlineHit || s.exited) return;
  const remaining = Math.max(0, SPLASH_HARD_DEADLINE_MS - (Date.now() - s.processStartMs));
  s.deadlineTimer = setTimeout(() => {
    const cur = store();
    cur.deadlineTimer = null;
    if (cur.exited || cur.deadlineHit) return;
    cur.deadlineHit = true;
    startupLaunchLog("SPLASH_HARD_DEADLINE", { ageMs: startupProcessAgeMs() });
    emit();
  }, remaining);
}

/** Call once from root layout module load / first render. */
export function ensureSplashHardDeadlineArmed(): void {
  armHardDeadlineOnce();
}

export function markSplashArmed(): void {
  const s = store();
  if (s.armed) return;
  s.armed = true;
  startupLaunchLog("SPLASH_FADE_ARMED", { ageMs: startupProcessAgeMs() });
}

export function markSplashExited(reason: string): boolean {
  const s = store();
  if (s.exited) return false;
  s.exited = true;
  s.deadlineHit = true;
  if (s.deadlineTimer) {
    clearTimeout(s.deadlineTimer);
    s.deadlineTimer = null;
  }
  const ageMs = startupProcessAgeMs();
  startupLaunchLog("SPLASH_HIDE", {
    reason,
    // ageMs = process age; do not confuse with branded-cover duration.
    processAgeMs: ageMs,
    blocksHome: true,
  });
  emit();
  return true;
}

export function isSplashExited(): boolean {
  return store().exited;
}

export function isSplashDeadlineHit(): boolean {
  const s = store();
  return s.deadlineHit || s.exited || Date.now() - s.processStartMs >= SPLASH_HARD_DEADLINE_MS;
}

export function splashProcessAgeMs(): number {
  return Date.now() - store().processStartMs;
}

export function useSplashDeadlineHit(): boolean {
  ensureSplashHardDeadlineArmed();
  return useSyncExternalStore(
    (onStoreChange) => {
      const s = store();
      s.listeners.add(onStoreChange);
      return () => {
        s.listeners.delete(onStoreChange);
      };
    },
    () => isSplashDeadlineHit(),
    () => isSplashDeadlineHit()
  );
}

export function useSplashExitedFlag(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const s = store();
      s.listeners.add(onStoreChange);
      return () => {
        s.listeners.delete(onStoreChange);
      };
    },
    () => isSplashExited(),
    () => isSplashExited()
  );
}

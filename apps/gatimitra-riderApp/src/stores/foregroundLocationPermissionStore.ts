import { create } from "zustand";

/**
 * Live OS-backed foreground location permission phase.
 * Never persist GRANTED as a sticky boolean — Android is authoritative.
 */
export type ForegroundLocationPermissionPhase =
  | "UNKNOWN"
  | "CHECKING"
  | "GRANTED"
  | "DENIED"
  | "REQUESTABLE"
  | "BLOCKED_OR_SETTINGS_REQUIRED"
  | "REQUESTING";

interface ForegroundLocationPermissionState {
  phase: ForegroundLocationPermissionPhase;
  canAskAgain: boolean | null;
  lastCheckedAtMs: number | null;
  /** Set when an auto OS prompt already ran this process (blocks infinite auto loops). */
  autoPromptConsumed: boolean;
  setPhase: (
    phase: ForegroundLocationPermissionPhase,
    extras?: { canAskAgain?: boolean | null }
  ) => void;
  setAutoPromptConsumed: (value: boolean) => void;
  reset: () => void;
}

export const useForegroundLocationPermissionStore =
  create<ForegroundLocationPermissionState>((set) => ({
    phase: "UNKNOWN",
    canAskAgain: null,
    lastCheckedAtMs: null,
    autoPromptConsumed: false,

    setPhase: (phase, extras) =>
      set((s) => ({
        phase,
        canAskAgain:
          extras && "canAskAgain" in extras ? extras.canAskAgain ?? null : s.canAskAgain,
        lastCheckedAtMs: Date.now(),
      })),

    setAutoPromptConsumed: (value) => set({ autoPromptConsumed: value }),

    reset: () =>
      set({
        phase: "UNKNOWN",
        canAskAgain: null,
        lastCheckedAtMs: null,
        autoPromptConsumed: false,
      }),
  }));

export function isForegroundLocationBlockingPhase(
  phase: ForegroundLocationPermissionPhase
): boolean {
  return (
    phase === "UNKNOWN" ||
    phase === "CHECKING" ||
    phase === "REQUESTING" ||
    phase === "REQUESTABLE" ||
    phase === "DENIED" ||
    phase === "BLOCKED_OR_SETTINGS_REQUIRED"
  );
}

/** True when Home location watchers / duty-on GPS may run. */
export function isForegroundLocationGrantedPhase(
  phase: ForegroundLocationPermissionPhase
): boolean {
  return phase === "GRANTED";
}

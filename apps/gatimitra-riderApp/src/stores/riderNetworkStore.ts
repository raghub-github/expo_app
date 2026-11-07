import NetInfo from "@react-native-community/netinfo";
import { create } from "zustand";
import { riderNetworkLog } from "@/src/lib/rider-action-log";

type RiderNetworkState = {
  online: boolean;
  restoredAt: number;
};

type RiderNetworkStore = RiderNetworkState & {
  setOnline: (online: boolean) => void;
};

const listeners = new Set<() => void>();

export const useRiderNetworkStore = create<RiderNetworkStore>((set, get) => ({
  online: true,
  restoredAt: 0,
  setOnline: (online) => {
    const prev = get().online;
    if (prev === online) return;
    if (online) {
      riderNetworkLog("RESTORED");
      set({ online: true, restoredAt: Date.now() });
      for (const fn of listeners) fn();
    } else {
      riderNetworkLog("OFFLINE");
      set({ online: false });
    }
  },
}));

export function isRiderNetworkOnline(): boolean {
  return useRiderNetworkStore.getState().online;
}

/** Fires only on OFFLINE → ONLINE. Keep work cheap — no OTP remount. */
export function subscribeRiderNetworkRestored(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let wired = false;
let netUnsub: (() => void) | null = null;

/**
 * Treat `isInternetReachable === null` as unknown — keep previous online state
 * so captive-portal / first-paint nulls do not falsely mark ONLINE and flush
 * pending critical actions.
 */
function resolveOnline(
  state: { isConnected: boolean | null; isInternetReachable: boolean | null },
  previousOnline: boolean,
): boolean {
  if (state.isConnected !== true) return false;
  if (state.isInternetReachable === false) return false;
  if (state.isInternetReachable === true) return true;
  return previousOnline;
}

export function startRiderNetworkMonitor(): void {
  if (wired) return;
  wired = true;
  netUnsub = NetInfo.addEventListener((state) => {
    const prev = useRiderNetworkStore.getState().online;
    useRiderNetworkStore.getState().setOnline(resolveOnline(state, prev));
  });
  void NetInfo.fetch()
    .then((state) => {
      const prev = useRiderNetworkStore.getState().online;
      const online = resolveOnline(state, prev);
      if (online) riderNetworkLog("ONLINE");
      else riderNetworkLog("OFFLINE");
      useRiderNetworkStore.getState().setOnline(online);
    })
    .catch(() => {});
}

export function stopRiderNetworkMonitorForTests(): void {
  netUnsub?.();
  netUnsub = null;
  wired = false;
}

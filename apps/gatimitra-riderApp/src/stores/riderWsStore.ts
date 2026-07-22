import { create } from "zustand";

type RiderWsStore = {
  gatewayReachable: boolean;
  socketConnected: boolean;
  setGatewayReachable: (reachable: boolean) => void;
  setSocketConnected: (connected: boolean) => void;
};

/** Tracks ws-gateway health for adaptive dispatch polling. */
export const useRiderWsStore = create<RiderWsStore>((set) => ({
  gatewayReachable: false,
  socketConnected: false,
  setGatewayReachable: (gatewayReachable) => set({ gatewayReachable }),
  setSocketConnected: (socketConnected) => set({ socketConnected }),
}));

export function isRiderDispatchRealtimeActive(): boolean {
  const { gatewayReachable, socketConnected } = useRiderWsStore.getState();
  return gatewayReachable && socketConnected;
}

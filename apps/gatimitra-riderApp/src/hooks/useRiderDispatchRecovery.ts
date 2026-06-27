import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { RIDER_AVAILABLE_ORDERS_QUERY_KEY } from "@/src/hooks/useOrders";
import { riderDispatchLog } from "@/src/lib/rider-dispatch-log";

const DUTY_SYNC_INTERVAL_MS = 60_000;
const FOREGROUND_POLL_INTERVAL_MS = 30_000;

/**
 * Keeps dispatch eligibility fresh: duty sync, offer polling, network recovery.
 * Complements RiderDispatchRealtime (WebSocket) and useAvailableOrders (5s poll).
 */
export function useRiderDispatchRecovery(): void {
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const hydrated = useSessionStore((s) => s.hydrated);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const syncDutyFromServer = useDutyStore((s) => s.syncFromServer);
  const wasOfflineRef = useRef(false);

  const refreshOffers = useCallback(async (reason: string) => {
    if (!hydrated || !session?.accessToken || session.role !== "rider" || !isOnDuty) {
      return;
    }
    riderDispatchLog(`refresh offers (${reason})`);
    try {
      await syncDutyFromServer();
    } catch {
      /* duty sync is best-effort */
    }
    await queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
    await queryClient.refetchQueries({
      queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY,
      type: "active",
    });
  }, [hydrated, session?.accessToken, session?.role, isOnDuty, syncDutyFromServer, queryClient]);

  useEffect(() => {
    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        void refreshOffers("app_foreground");
      }
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [refreshOffers]);

  useEffect(() => {
    if (!isOnDuty || !session?.accessToken) return;
    const id = setInterval(() => {
      void syncDutyFromServer();
    }, DUTY_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isOnDuty, session?.accessToken, syncDutyFromServer]);

  useEffect(() => {
    if (!isOnDuty) return;
    const id = setInterval(() => {
      if (AppState.currentState !== "active") return;
      void queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
    }, FOREGROUND_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isOnDuty, queryClient]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (!online) {
        wasOfflineRef.current = true;
        riderDispatchLog("network offline");
        return;
      }
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        void refreshOffers("network_restored");
      }
    });
    return () => unsub();
  }, [refreshOffers]);
}

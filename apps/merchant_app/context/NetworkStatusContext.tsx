/**
 * App-wide connectivity — drives red offline bar + local system notification.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

const OFFLINE_NOTIF_ID = "mx_offline_network_v1";
const OFFLINE_CHANNEL = "merchant_connectivity";

type NetworkContextValue = {
  isOnline: boolean;
  /** True once we have received at least one NetInfo snapshot. */
  ready: boolean;
  refresh: () => Promise<void>;
};

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  ready: false,
  refresh: async () => {},
});

function isConnectedState(state: NetInfoState): boolean {
  // Treat null as online to avoid flashing the bar before the first real read.
  if (state.isConnected == null) return true;
  if (state.isConnected === false) return false;
  // Cellular/wifi connected but no internet (captive portal) — still offline UX.
  if (state.isInternetReachable === false) return false;
  return true;
}

async function ensureOfflineChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.setNotificationChannelAsync(OFFLINE_CHANNEL, {
      name: "Connectivity",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 120],
      lightColor: "#B91C1C",
      bypassDnd: false,
    });
  } catch {
    /* Expo Go / module missing */
  }
}

async function showOfflineSystemNotification(): Promise<void> {
  try {
    await ensureOfflineChannel();
    const Notifications = await import("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      identifier: OFFLINE_NOTIF_ID,
      content: {
        title: "Oops, no network available!",
        body: "Please check your internet connection and try again",
        data: { type: "offline_network" },
        sound: false,
        ...(Platform.OS === "android"
          ? {
              channelId: OFFLINE_CHANNEL,
              sticky: true,
              autoDismiss: false,
              priority: Notifications.AndroidNotificationPriority.HIGH,
              color: "#B91C1C",
            }
          : {}),
      },
      trigger: null,
    });
  } catch {
    /* Expo Go may log; ignore */
  }
}

async function dismissOfflineSystemNotification(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.dismissNotificationAsync(OFFLINE_NOTIF_ID);
  } catch {
    /* ignore */
  }
}

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const wasOfflineRef = useRef(false);
  const notifShownRef = useRef(false);

  const applyState = useCallback(async (state: NetInfoState) => {
    const online = isConnectedState(state);
    setIsOnline(online);
    setReady(true);

    if (!online) {
      wasOfflineRef.current = true;
      if (!notifShownRef.current) {
        notifShownRef.current = true;
        await showOfflineSystemNotification();
      }
      return;
    }

    if (wasOfflineRef.current || notifShownRef.current) {
      wasOfflineRef.current = false;
      notifShownRef.current = false;
      await dismissOfflineSystemNotification();
    }
  }, []);

  const refresh = useCallback(async () => {
    const state = await NetInfo.fetch();
    await applyState(state);
  }, [applyState]);

  useEffect(() => {
    void refresh();
    const unsub = NetInfo.addEventListener((state) => {
      void applyState(state);
    });
    const appSub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") void refresh();
    });
    return () => {
      unsub();
      appSub.remove();
    };
  }, [applyState, refresh]);

  const value = useMemo(
    () => ({ isOnline, ready, refresh }),
    [isOnline, ready, refresh]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetworkStatus(): NetworkContextValue {
  return useContext(NetworkContext);
}

/**
 * App-wide connectivity — drives red offline bar + local system notification.
 *
 * Android (dev client / production): native OfflineConnectivityMonitor
 * (NetworkCallback via ContentProvider) owns the tray alert while the process
 * is alive in foreground OR background — same pattern Zomato uses.
 *
 * JS still posts the tray alert on iOS and Expo Go (no native monitor there).
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
import Constants from "expo-constants";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import { isMerchantIdleStatusNotification } from "@/lib/merchantStatusNotification";
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

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

/** Native Android monitor posts the tray alert — avoid duplicate JS notifications. */
function jsOwnsTrayNotification(): boolean {
  if (Platform.OS === "ios") return true;
  return isExpoGo();
}

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
      description: "Alerts when the device has no internet",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 120],
      lightColor: "#B91C1C",
      bypassDnd: false,
      showBadge: false,
      enableVibrate: true,
    });
  } catch {
    /* Expo Go / module missing */
  }
}

/** Allow the offline tray alert even while the app is in the foreground. */
async function ensureForegroundPresentation(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data as { type?: string } | undefined;
        const type = data?.type;
        const isOffline = type === "offline_network";
        const isIdleStatus = isMerchantIdleStatusNotification(data ?? null);
        if (isIdleStatus) {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          };
        }
        return {
          shouldShowAlert: true,
          shouldPlaySound: !isOffline,
          shouldSetBadge: !isOffline,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });
  } catch {
    /* ignore */
  }
}

const OFFLINE_NOTIF_ID = "mx_offline_network_v1";

async function hasNotificationPermission(): Promise<boolean> {
  try {
    const Notifications = await import("expo-notifications");
    const perm = await Notifications.getPermissionsAsync();
    return perm.granted === true || perm.status === "granted";
  } catch {
    return false;
  }
}

/** @returns true when the tray notification was posted successfully. */
async function showOfflineSystemNotification(): Promise<boolean> {
  if (!jsOwnsTrayNotification()) {
    // Native OfflineConnectivityMonitor handles Android background/foreground tray.
    return true;
  }
  try {
    const allowed = await hasNotificationPermission();
    if (!allowed) return false;

    await ensureForegroundPresentation();
    await ensureOfflineChannel();
    const Notifications = await import("expo-notifications");

    try {
      await Notifications.dismissNotificationAsync(OFFLINE_NOTIF_ID);
    } catch {
      /* ignore */
    }

    await Notifications.scheduleNotificationAsync({
      identifier: OFFLINE_NOTIF_ID,
      content: {
        title: "🚫 Oops, no network available!",
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
    return true;
  } catch {
    return false;
  }
}

async function dismissOfflineSystemNotification(): Promise<void> {
  if (!jsOwnsTrayNotification()) return;
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
        const ok = await showOfflineSystemNotification();
        if (ok) notifShownRef.current = true;
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
      if (s === "background" && wasOfflineRef.current && !notifShownRef.current) {
        void (async () => {
          const ok = await showOfflineSystemNotification();
          if (ok) notifShownRef.current = true;
        })();
      }
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

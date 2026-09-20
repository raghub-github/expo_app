/**
 * Must load before Expo Router so killed/background FCM can present a tray item
 * and the notification task is registered with the native runtime.
 *
 * Expo Go (SDK 53+) errors if expo-notifications is imported — skip there.
 * Production / dev-client builds still register the handler + background task.
 *
 * NEW ORDER sound: when Manage communication has cached the Super Admin sound
 * locally, mute the OS channel chime and play that file instead (same tone as
 * the in-app alert). If no cache yet, fall back to the bundled channel sound.
 */
function isExpoGo() {
  try {
    const Constants = require("expo-constants");
    return (
      Constants.appOwnership === "expo" ||
      Constants.executionEnvironment === "storeClient"
    );
  } catch {
    return false;
  }
}

function isMerchantNewOrderData(data) {
  const t = String(data?.type ?? data?.event ?? data?.gmType ?? data?.template_code ?? "").toLowerCase();
  return (
    t === "merchant_new_order" ||
    t === "new_order" ||
    data?.screen === "new_order" ||
    String(data?.template_code ?? "").toUpperCase() === "MERCHANT_NEW_ORDER" ||
    String(data?.gmType ?? "").toUpperCase() === "MERCHANT_NEW_ORDER"
  );
}

function isStoreStatusData(data) {
  const typ = String(data?.type ?? data?.notificationType ?? data?.event ?? "").toUpperCase();
  return (
    typ === "STORE_STATUS" ||
    typ === "STORE_ONLINE" ||
    typ === "STORE_OUT_OF_TIMINGS" ||
    typ === "STORE_RECONNECT_REQUIRED" ||
    typ === "MERCHANT_OUTSIDE_DELIVERY" ||
    typ === "MERCHANT_GO_ONLINE"
  );
}

async function readCachedAlertLocalUri() {
  try {
    const SecureStore = require("expo-secure-store");
    const raw = await SecureStore.getItemAsync("merchant_alert_sound_cache_v1");
    if (!raw) return null;
    const meta = JSON.parse(raw);
    const uri = typeof meta?.localUri === "string" ? meta.localUri.trim() : "";
    return uri || null;
  } catch {
    return null;
  }
}

async function playCachedAlertSound(localUri) {
  if (!localUri) return false;
  try {
    const { createAudioPlayer, setAudioModeAsync } = require("expo-audio");
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      shouldRouteThroughEarpiece: false,
    });
    const player = createAudioPlayer({ uri: localUri }, { downloadFirst: false });
    player.loop = false;
    player.volume = 1;
    player.play();
    // Detach after a generous clip window — background task must not hang.
    setTimeout(() => {
      try {
        player.pause();
      } catch {
        /* ignore */
      }
      try {
        player.remove();
      } catch {
        /* ignore */
      }
    }, 12_000);
    return true;
  } catch {
    return false;
  }
}

if (!isExpoGo()) {
  try {
    const Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification?.request?.content?.data ?? {};
        const t = String(data.type ?? data.notificationType ?? "").toLowerCase();
        // Legacy kitchen sticky id only — never suppress STORE_STATUS updates.
        if (t === "live_orders") {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          };
        }
        const isNewOrder = isMerchantNewOrderData(data);
        const AppState = require("react-native").AppState;
        const appActive = AppState.currentState === "active";
        let nativeOwns = false;
        try {
          const { isNativeOrderAlertAvailable } = require("@gatimitra/expo-push-kit");
          nativeOwns = isNewOrder && isNativeOrderAlertAvailable();
        } catch {
          nativeOwns = false;
        }
        if (isStoreStatusData(data)) {
          const state = String(data.state ?? data.storeState ?? "").toUpperCase();
          const headsUp =
            state === "OUT_OF_TIMINGS" ||
            state === "OUT_OF_DELIVERY_TIMINGS" ||
            state === "RECONNECT" ||
            state === "RECONNECT_REQUIRED";
          return {
            shouldShowAlert: true,
            shouldPlaySound: headsUp,
            shouldSetBadge: false,
            shouldShowBanner: headsUp || !appActive,
            shouldShowList: true,
          };
        }

        let cachedUri = null;
        if (isNewOrder && !nativeOwns) {
          cachedUri = await readCachedAlertLocalUri();
          // App open → JS/modal owns sound. Background with cache → play Manage communication tone.
          if (!appActive && cachedUri) {
            void playCachedAlertSound(cachedUri);
          }
        }

        // Native FGS owns the looping buzzer — mute OS + skip cached JS playback.
        const suppressOsSound =
          nativeOwns ||
          (isNewOrder && appActive) ||
          (isNewOrder && !!cachedUri);
        return {
          shouldShowAlert: true,
          shouldPlaySound: !suppressOsSound,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });
  } catch {
    /* missing native module */
  }

  try {
    const Notifications = require("expo-notifications");
    const TaskManager = require("expo-task-manager");
    const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";
    if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
      TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
        if (error) return;
        try {
          const notification = data?.notification ?? data;
          const content = notification?.request?.content ?? notification?.content ?? {};
          const payload = content?.data ?? {};
          if (!isMerchantNewOrderData(payload)) return;
          try {
            const { isNativeOrderAlertAvailable } = require("@gatimitra/expo-push-kit");
            if (isNativeOrderAlertAvailable()) return;
          } catch {
            /* fallback to cached clip */
          }
          const cachedUri = await readCachedAlertLocalUri();
          if (cachedUri) {
            await playCachedAlertSound(cachedUri);
          }
        } catch {
          /* best-effort */
        }
      });
    }
    Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});
  } catch {
    /* expo-task-manager optional on some runtimes */
  }
}

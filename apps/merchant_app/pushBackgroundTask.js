/**
 * Must load before Expo Router so killed/background FCM can present a tray item
 * and the notification task is registered with the native runtime.
 *
 * Expo Go (SDK 53+) errors if expo-notifications is imported — skip there.
 * Production / dev-client builds still register the handler + background task.
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
        // Killed: this handler never runs; OS uses merchant_new_orders_alert.
        // Background (process alive): OS channel sound (shouldPlaySound true).
        // Foreground: mute OS — Incoming Order modal / JS owns the chime.
        const suppressOsSound = isNewOrder && appActive;
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
      TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, () => {
        /* OS displays notification+data payloads; this keeps Expo from dropping them. */
      });
    }
    Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});
  } catch {
    /* expo-task-manager optional on some runtimes */
  }
}

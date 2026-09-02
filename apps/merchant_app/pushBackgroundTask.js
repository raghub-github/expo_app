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

if (!isExpoGo()) {
  try {
    const Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification?.request?.content?.data ?? {};
        const t = String(data.type ?? data.notificationType ?? "").toLowerCase();
        // Only suppress the local kitchen sticky duplicate — server pushes for
        // store_online / go-online must still appear in the system shade.
        const isLocalKitchenSticky = t === "live_orders";
        if (isLocalKitchenSticky) {
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
          shouldPlaySound: true,
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

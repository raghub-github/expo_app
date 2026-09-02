/**
 * Must load before Expo Router so killed/background FCM can present a tray item
 * and the notification task is registered with the native runtime.
 *
 * Expo Go (SDK 53+) errors if expo-notifications is imported — skip there.
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
    const {
      applyLiveProgressFromPush,
      liveProgressHandlerResult,
    } = require("./lib/customerLiveOrderNotificationNative");

    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification?.request?.content?.data ?? {};
        if (liveProgressHandlerResult(data).suppress) {
          try {
            await applyLiveProgressFromPush(data);
          } catch {
            /* best-effort sticky update */
          }
        }
        const result = liveProgressHandlerResult(data);
        return {
          shouldShowAlert: result.shouldShowAlert,
          shouldPlaySound: result.shouldPlaySound,
          shouldSetBadge: result.shouldSetBadge,
          shouldShowBanner: result.shouldShowBanner,
          shouldShowList: result.shouldShowList,
        };
      },
    });
  } catch {
    /* missing native module */
  }

  try {
    const Notifications = require("expo-notifications");
    const TaskManager = require("expo-task-manager");
    const { applyLiveProgressFromPush } = require("./lib/customerLiveOrderNotificationNative");
    const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";
    if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
      TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
        if (error) return;
        const payload = data?.notification?.request?.content?.data ?? data?.data ?? null;
        if (payload && typeof payload === "object") {
          try {
            await applyLiveProgressFromPush(payload);
          } catch {
            /* best-effort */
          }
        }
      });
    }
    Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});
  } catch {
    /* expo-task-manager optional on some runtimes */
  }
}

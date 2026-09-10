/**
 * Must load before Expo Router so killed/background FCM can present a tray item
 * and the notification task is registered with the native runtime.
 *
 * App states (all must show push in shade):
 *   OPEN       — list visible; dispatch OS sound muted (IncomingRideOrderHost chime)
 *   BACKGROUND — list + OS sound (handler may still run)
 *   KILLED     — handler does not run; FCM notification block + channel sound
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

function isRiderDispatchOfferData(data) {
  const t = String(
    data?.type ?? data?.event ?? data?.gmType ?? data?.template_code ?? ""
  ).toLowerCase();
  return (
    t === "dispatch_offer" ||
    t === "rider_dispatch_offer" ||
    t === "incoming_order" ||
    t === "force_assignment_offer" ||
    t === "new_order" ||
    String(data?.template_code ?? "").toUpperCase() === "RIDER_DISPATCH_OFFER" ||
    String(data?.gmType ?? "").toUpperCase() === "DISPATCH_OFFER"
  );
}

if (!isExpoGo()) {
  try {
    const Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification?.request?.content?.data ?? {};
        const isDispatchOffer = isRiderDispatchOfferData(data);
        const AppState = require("react-native").AppState;
        const appActive = AppState.currentState === "active";
        // Never hide from shade in any state. Only mute OS for dispatch while
        // the rider is actively in the app (in-app offer host plays the chime).
        return {
          shouldShowAlert: true,
          shouldPlaySound: !(isDispatchOffer && appActive),
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

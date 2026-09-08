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
        // Killed: this handler never runs; OS uses rider_dispatch_offers_alert
        // from the FCM notification block (must stay audible).
        // Background/cached: this handler MAY run — still allow OS sound.
        // Active: mute OS; IncomingRideOrderHost plays the bundled chime.
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

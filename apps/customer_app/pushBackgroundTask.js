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
  function patchMyOrdersFromPush(payload) {
    if (!payload || typeof payload !== "object") return;
    try {
      const { statusFromCustomerLifecyclePush } = require("./lib/customer-order-status-machine");
      const { applyStatusToCachedMyOrders } = require("./lib/myOrdersCache");
      const status = statusFromCustomerLifecyclePush(payload);
      if (!status) return;
      applyStatusToCachedMyOrders(
        [
          payload.orderId,
          payload.order_id,
          payload.orderIdText,
          payload.formattedOrderId,
          payload.formatted_order_id,
        ],
        status
      );
    } catch {
      /* cache patch is best-effort in headless JS */
    }
  }

  try {
    const Notifications = require("expo-notifications");
    const {
      applyLiveProgressFromPush,
      dismissLiveOrderProgressForOrder,
      liveProgressHandlerResult,
      shouldClearLiveProgress,
    } = require("./lib/customerLiveOrderNotificationNative");

    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification?.request?.content?.data ?? {};
        patchMyOrdersFromPush(data);
        const result = liveProgressHandlerResult(data);
        try {
          if (result.clearProgress || shouldClearLiveProgress(data)) {
            const oid = String(data.orderId || data.order_id || "").trim();
            if (oid) await dismissLiveOrderProgressForOrder(oid);
          } else if (result.updateSticky || result.suppress) {
            await applyLiveProgressFromPush(data);
          }
        } catch {
          /* best-effort sticky update / clear */
        }
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
    const {
      applyLiveProgressFromPush,
      dismissLiveOrderProgressForOrder,
      shouldClearLiveProgress,
    } = require("./lib/customerLiveOrderNotificationNative");
    const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";
    if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
      TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
        if (error) return;
        const payload = data?.notification?.request?.content?.data ?? data?.data ?? null;
        if (payload && typeof payload === "object") {
          patchMyOrdersFromPush(payload);
          try {
            if (shouldClearLiveProgress(payload)) {
              const oid = String(payload.orderId || payload.order_id || "").trim();
              if (oid) await dismissLiveOrderProgressForOrder(oid);
            } else {
              await applyLiveProgressFromPush(payload);
            }
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

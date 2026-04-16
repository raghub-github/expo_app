import Constants from "expo-constants";

export type PushNotificationOpenPayload = {
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
};

async function loadNotifications(): Promise<typeof import("expo-notifications") | null> {
  try {
    if (Constants.appOwnership === "expo") {
      return null;
    }
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

/** User tapped a notification (background / killed → foreground). */
export function subscribeToPushNotificationResponse(
  handler: (payload: PushNotificationOpenPayload) => void
): { remove: () => void } {
  let sub: { remove: () => void } = { remove: () => {} };
  void (async () => {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const c = response.notification.request.content;
      const data = (c.data ?? {}) as Record<string, unknown>;
      handler({
        title: c.title ?? null,
        body: c.body ?? null,
        data,
      });
    });
  })();
  return {
    remove: () => sub.remove(),
  };
}

/** Notification delivered while app is foreground. */
export function subscribeToForegroundNotifications(
  handler: (payload: PushNotificationOpenPayload) => void
): { remove: () => void } {
  let sub: { remove: () => void } = { remove: () => {} };
  void (async () => {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    sub = Notifications.addNotificationReceivedListener((notification) => {
      const c = notification.request.content;
      const data = (c.data ?? {}) as Record<string, unknown>;
      handler({
        title: c.title ?? null,
        body: c.body ?? null,
        data,
      });
    });
  })();
  return {
    remove: () => sub.remove(),
  };
}

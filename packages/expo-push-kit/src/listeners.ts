import Constants from "expo-constants";

export type PushNotificationOpenPayload = {
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
  actionIdentifier?: string | null;
  /** When the OS received the notification (ms). Used to resume alert progress. */
  date?: number | null;
};

/**
 * Never load `expo-notifications` inside Expo Go *for remote push*.
 * Local notifications + received/response listeners still work in Expo Go —
 * pass `allowExpoGo: true` for those paths. Importing without that flag stays
 * blocked so DevicePushTokenAutoRegistration is not triggered accidentally.
 */
async function loadNotifications(opts?: {
  allowExpoGo?: boolean;
}): Promise<typeof import("expo-notifications") | null> {
  try {
    if (Constants.appOwnership === "expo" && !opts?.allowExpoGo) {
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
    const Notifications = await loadNotifications({ allowExpoGo: true });
    if (!Notifications) return;
    sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const c = response.notification.request.content;
      const data = (c.data ?? {}) as Record<string, unknown>;
      handler({
        title: c.title ?? null,
        body: c.body ?? null,
        data,
        date: response.notification.date,
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
    const Notifications = await loadNotifications({ allowExpoGo: true });
    if (!Notifications) return;
    sub = Notifications.addNotificationReceivedListener((notification) => {
      const c = notification.request.content;
      const data = (c.data ?? {}) as Record<string, unknown>;
      handler({
        title: c.title ?? null,
        body: c.body ?? null,
        data,
        date: notification.date,
      });
    });
  })();
  return {
    remove: () => sub.remove(),
  };
}

/** Drain the cold-start notification that launched the app (if any). */
export async function getLastNotificationOpenPayload(): Promise<PushNotificationOpenPayload | null> {
  const Notifications = await loadNotifications({ allowExpoGo: true });
  if (!Notifications) return null;
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last) return null;
    const c = last.notification.request.content;
    return {
      title: c.title ?? null,
      body: c.body ?? null,
      data: (c.data ?? {}) as Record<string, unknown>,
      date: last.notification.date,
    };
  } catch {
    return null;
  }
}

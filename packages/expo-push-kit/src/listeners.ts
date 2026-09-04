import Constants from "expo-constants";

export type PushNotificationOpenPayload = {
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
  actionIdentifier?: string | null;
};

/**
 * Never load `expo-notifications` inside Expo Go (SDK 53+).
 * Importing the package triggers DevicePushTokenAutoRegistration and a loud
 * console.error about remote push being removed from Expo Go — even for local
 * notification APIs. Remote push does not work in Expo Go anyway.
 */
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

/** Drain the cold-start notification that launched the app (if any). */
export async function getLastNotificationOpenPayload(): Promise<PushNotificationOpenPayload | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last) return null;
    const c = last.notification.request.content;
    return {
      title: c.title ?? null,
      body: c.body ?? null,
      data: (c.data ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

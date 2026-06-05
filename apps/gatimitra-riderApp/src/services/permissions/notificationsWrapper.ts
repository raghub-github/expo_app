/**
 * Wrapper for expo-notifications — uses the real permission APIs on all builds
 * including Expo Go (Android notification permission is owned by the host app).
 */

export async function requestNotificationPermissions() {
  try {
    const Notifications = await import("expo-notifications");
    const { requestPermissionsAsync, setNotificationHandler } = Notifications;

    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const result = await requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
      android: {},
    });

    return {
      status: result.status as "granted" | "denied" | "undetermined",
      canAskAgain: result.status !== "denied",
    };
  } catch (error) {
    console.warn("requestNotificationPermissions failed:", error);
    return {
      status: "denied" as const,
      canAskAgain: false,
    };
  }
}

export async function getNotificationPermissions() {
  try {
    const Notifications = await import("expo-notifications");
    const { getPermissionsAsync } = Notifications;
    const result = await getPermissionsAsync();
    return {
      status: result.status as "granted" | "denied" | "undetermined",
    };
  } catch (error) {
    console.warn("getNotificationPermissions failed:", error);
    return {
      status: "undetermined" as const,
    };
  }
}

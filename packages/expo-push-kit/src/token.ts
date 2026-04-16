import Constants from "expo-constants";
import { Platform } from "react-native";

export type AndroidChannelOptions = {
  channelId: string;
  name: string;
  importance?: number;
  vibrationPattern?: number[];
  lightColor?: string;
};

/** Avoid static import of expo-notifications so Expo Go / web fail gracefully. */
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

function resolveProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const eas = extra?.eas as Record<string, unknown> | undefined;
  const fromExtra = typeof eas?.projectId === "string" ? eas.projectId : undefined;
  const fromEasConfig =
    typeof (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId === "string"
      ? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig!.projectId
      : undefined;
  return fromExtra || fromEasConfig || undefined;
}

/**
 * Foreground presentation defaults. Call once at app startup (before registering token).
 */
export async function setNotificationHandlerDefaults(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureAndroidChannel(opts: AndroidChannelOptions): Promise<void> {
  if (Platform.OS !== "android") return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await Notifications.setNotificationChannelAsync(opts.channelId, {
    name: opts.name,
    importance: opts.importance ?? Notifications.AndroidImportance.HIGH,
    vibrationPattern: opts.vibrationPattern ?? [0, 250, 250, 250],
    lightColor: opts.lightColor ?? "#14b8a6",
  });
}

/**
 * Always obtains the token from Expo (getExpoPushTokenAsync). Never reads a persisted/cached
 * token as the source of truth — callers may compare with a previous value in memory to avoid
 * redundant API calls, but registration should use this fresh value.
 */
export async function getFreshExpoPushToken(): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  let Device: typeof import("expo-device");
  try {
    Device = await import("expo-device");
  } catch {
    return null;
  }
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return null;
  }

  const projectId = resolveProjectId();
  try {
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data?.trim() ?? "";
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

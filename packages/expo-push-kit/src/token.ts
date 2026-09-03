import Constants from "expo-constants";
import { Platform } from "react-native";
import { loadNotificationsModule, readNotificationPermission } from "./permission";
import type { NativePushTokenType } from "./types";

export type AndroidChannelOptions = {
  channelId: string;
  name: string;
  importance?: number;
  vibrationPattern?: number[];
  lightColor?: string;
  /** Android raw sound name (no extension), e.g. `cx_notification`. */
  sound?: string;
};

function resolveProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const eas = extra?.eas as Record<string, unknown> | undefined;
  const fromExtra = typeof eas?.projectId === "string" ? eas.projectId : undefined;
  const fromEasConfig =
    typeof (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId ===
    "string"
      ? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig!.projectId
      : undefined;
  return fromExtra || fromEasConfig || undefined;
}

/**
 * Foreground presentation defaults. Call once at app startup (before registering token).
 */
export async function setNotificationHandlerDefaults(): Promise<void> {
  const Notifications = await loadNotificationsModule({ allowExpoGo: true });
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
  const Notifications = await loadNotificationsModule({ allowExpoGo: true });
  if (!Notifications) return;
  const importance =
    opts.importance === 5
      ? Notifications.AndroidImportance.MAX
      : opts.importance === 3
        ? Notifications.AndroidImportance.DEFAULT
        : (opts.importance ?? Notifications.AndroidImportance.HIGH);
  await Notifications.setNotificationChannelAsync(opts.channelId, {
    name: opts.name,
    importance,
    vibrationPattern: opts.vibrationPattern ?? [0, 250, 250, 250],
    lightColor: opts.lightColor ?? "#14b8a6",
    ...(opts.sound ? { sound: opts.sound } : {}),
  });
}

export async function ensureAndroidChannels(channels: AndroidChannelOptions[]): Promise<void> {
  for (const ch of channels) {
    await ensureAndroidChannel(ch);
  }
}

/**
 * Always obtains the token from Expo (getExpoPushTokenAsync). Never reads a persisted/cached
 * token as the source of truth — callers may compare with a previous value in memory to avoid
 * redundant API calls, but registration should use this fresh value.
 *
 * When `requestIfNeeded` is false, returns null if permission is not already granted
 * (controller owns the request/settings flow).
 */
export async function getFreshExpoPushToken(opts?: {
  requestIfNeeded?: boolean;
}): Promise<string | null> {
  const Notifications = await loadNotificationsModule({ allowExpoGo: false });
  if (!Notifications) return null;

  let Device: typeof import("expo-device");
  try {
    Device = await import("expo-device");
  } catch {
    return null;
  }
  if (!Device.isDevice) return null;

  const perm = await readNotificationPermission();
  if (perm.osStatus !== "granted") {
    if (opts?.requestIfNeeded === false) return null;
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    if (status !== "granted") return null;
  }

  const projectId = resolveProjectId();
  try {
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data?.trim() ?? "";
    if (token.length > 0) {
      const masked =
        token.length <= 12 ? `${token.slice(0, 4)}…` : `${token.slice(0, 8)}…${token.slice(-4)}`;
      console.log("[push] Expo push token obtained", { token: masked, projectId: projectId ?? null });
      return token;
    }
    console.warn("[push] getExpoPushTokenAsync returned empty token");
    return null;
  } catch (e) {
    console.warn("[push] getExpoPushTokenAsync failed:", (e as Error)?.message ?? e);
    return null;
  }
}

export type DevicePushTokenResult = {
  token: string;
  type: NativePushTokenType;
};

/**
 * Native FCM (Android) / APNs (iOS) device token. Requires a real build with
 * Firebase / APNs credentials — fails loudly (returns null + warn) on mismatch.
 */
export async function getFreshNativePushToken(): Promise<DevicePushTokenResult | null> {
  const Notifications = await loadNotificationsModule({ allowExpoGo: false });
  if (!Notifications) return null;

  let Device: typeof import("expo-device");
  try {
    Device = await import("expo-device");
  } catch {
    return null;
  }
  if (!Device.isDevice) return null;

  const perm = await readNotificationPermission();
  if (perm.osStatus !== "granted") return null;

  try {
    console.log("[push] FCM/APNs initialized — requesting device push token");
    const deviceToken = await Notifications.getDevicePushTokenAsync();
    const raw = String(deviceToken?.data ?? "").trim();
    if (!raw) {
      console.warn("[push] getDevicePushTokenAsync returned empty token — check FCM/APNs credentials");
      return null;
    }
    const type: NativePushTokenType =
      deviceToken.type === "ios" || Platform.OS === "ios" ? "apns" : "fcm";
    const masked =
      raw.length <= 12 ? `${raw.slice(0, 4)}…` : `${raw.slice(0, 8)}…${raw.slice(-4)}`;
    console.log("[push] FCM token obtained", { type, token: masked });
    return { token: raw, type };
  } catch (e) {
    console.warn(
      "[push] getDevicePushTokenAsync failed (credentials/project mismatch?):",
      (e as Error)?.message ?? e
    );
    return null;
  }
}

export function resolveEasProjectId(): string | undefined {
  return resolveProjectId();
}

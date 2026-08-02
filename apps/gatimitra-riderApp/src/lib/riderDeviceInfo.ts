import { Platform } from "react-native";
import Constants from "expo-constants";

export type RiderLoginDeviceMeta = {
  deviceType: string;
  deviceModel: string | null;
  os: string;
  osVersion: string | null;
  appVersion: string | null;
};

export function getRiderLoginDeviceMeta(): RiderLoginDeviceMeta {
  const appVersion =
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    (typeof Constants.manifest2?.extra?.expoClient?.version === "string"
      ? Constants.manifest2.extra.expoClient.version
      : null);

  const platformConstants = (Platform.constants ?? {}) as Record<string, unknown>;

  return {
    deviceType: "mobile",
    deviceModel:
      typeof platformConstants.Model === "string"
        ? platformConstants.Model
        : typeof platformConstants.model === "string"
          ? platformConstants.model
          : null,
    os: Platform.OS,
    osVersion:
      typeof Platform.Version === "string"
        ? Platform.Version
        : Platform.Version != null
          ? String(Platform.Version)
          : null,
    appVersion: appVersion ?? null,
  };
}

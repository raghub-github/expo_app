/**
 * Friendly device labels for merchant session rows (Zomato-style).
 * Prefer real model name over generic "Android device".
 */

import { Platform } from "react-native";
import * as Device from "expo-device";

export type MerchantDeviceMetaPayload = {
  deviceName: string;
  deviceType: "mobile" | "tablet" | "web";
  os: string;
  appSource: "merchant_app";
};

function cleanLabel(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function isGenericModel(name: string): boolean {
  const n = name.toLowerCase();
  return (
    !n ||
    n === "unknown" ||
    n.includes("sdk_gphone") ||
    n.includes("emulator") ||
    (n === "iphone" && Platform.OS !== "ios")
  );
}

export async function getMerchantDeviceMeta(): Promise<MerchantDeviceMetaPayload> {
  const brand = cleanLabel(Device.brand);
  const model = cleanLabel(Device.modelName) || cleanLabel(Device.deviceName);
  const osVersion = cleanLabel(Device.osVersion);
  const isTablet = Device.deviceType === Device.DeviceType.TABLET;

  let deviceName = model;
  if (isGenericModel(deviceName)) {
    if (Platform.OS === "ios") {
      deviceName = isTablet ? "iPad" : "iPhone";
    } else if (Platform.OS === "android") {
      deviceName = brand ? `${brand} phone` : "Android phone";
    } else {
      deviceName = "Web browser";
    }
  } else if (brand && Platform.OS === "android" && !deviceName.toLowerCase().includes(brand.toLowerCase())) {
    deviceName = `${brand} ${deviceName}`;
  }

  const osBase =
    Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web";
  const os = osVersion ? `${osBase} ${osVersion}` : osBase;

  return {
    deviceName: cleanLabel(deviceName) || "Mobile device",
    deviceType: Platform.OS === "web" ? "web" : isTablet ? "tablet" : "mobile",
    os,
    appSource: "merchant_app",
  };
}

import { Platform, PermissionsAndroid, Linking } from "react-native";
import * as Contacts from "expo-contacts";
import {
  getSmsPermissionGranted as getSmsGrantedFromManager,
  runSmsAllowPipeline,
  requestSmsPermissionOrOpenSettings as requestSmsFromManager,
} from "@/lib/smsPermissionManager";

export type SmsPermissionRequestResult = {
  status: "granted" | "denied";
  openedSettings: boolean;
};

/** Android: READ_SMS. iOS: always granted (Message AutoFill). */
export async function getSmsPermissionGranted(): Promise<boolean> {
  return getSmsGrantedFromManager();
}

export async function requestSmsPermission(): Promise<"granted" | "denied"> {
  const result = await runSmsAllowPipeline();
  return result.status;
}

export async function requestSmsPermissionOrOpenSettings(options?: {
  openSettingsOnDeny?: boolean;
}): Promise<SmsPermissionRequestResult> {
  return requestSmsFromManager(options);
}

export async function getContactsPermissionGranted(): Promise<boolean> {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/** @deprecated kept for any stray imports */
export async function openAppPermissionSettingsLegacy(): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await Linking.openURL("app-settings:");
    } else {
      await Linking.openSettings();
    }
  } catch {
    await Linking.openSettings().catch(() => undefined);
  }
}

export { PermissionsAndroid };

import { Platform, PermissionsAndroid } from "react-native";
import * as Contacts from "expo-contacts";

/** READ_SMS is the permission that matters for OTP autofill on Android. */
export async function getSmsPermissionGranted(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  } catch {
    return false;
  }
}

export async function requestSmsPermission(): Promise<"granted" | "denied"> {
  if (Platform.OS !== "android") return "granted";
  try {
    const read = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
      title: "Read SMS",
      message:
        "GatiMitra can read OTP messages to verify your login. Order updates may use SMS on some devices.",
      buttonPositive: "Allow",
      buttonNegative: "Deny",
    });
    if (read !== PermissionsAndroid.RESULTS.GRANTED) {
      return "denied";
    }
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS, {
      title: "SMS notifications",
      message: "Optional: receive SMS-related events. You can still use the app if you deny this.",
      buttonPositive: "Allow",
      buttonNegative: "Skip",
    });
    return "granted";
  } catch {
    return "denied";
  }
}

export async function getContactsPermissionGranted(): Promise<boolean> {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

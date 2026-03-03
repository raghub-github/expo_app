import { Platform } from "react-native";
import * as Application from "expo-application";
import { getItem, setItem } from "@/utils/storage";

const DEVICE_ID_KEY = "gm_customer_device_id";

function generateId(): string {
  return "gm-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

/**
 * Returns a stable device id (min 6 chars) for API (e.g. OTP verify).
 * Android: androidId; iOS/Web: stored UUID in SecureStore/localStorage.
 */
export async function getDeviceIdAsync(): Promise<string> {
  if (Platform.OS === "android") {
    try {
      const id = Application.getAndroidId();
      if (id && id.length >= 6) return id;
    } catch {
      // fall through to stored id
    }
  }
  const stored = await getItem(DEVICE_ID_KEY);
  if (stored && stored.length >= 6) return stored;
  const newId = generateId();
  await setItem(DEVICE_ID_KEY, newId);
  return newId;
}

/**
 * Web-safe SecureStore facade for Partner.
 *
 * expo-secure-store has no usable native backend on web — calling
 * setItemAsync throws `setValueWithKeyAsync is not a function` and breaks OTP.
 * On web we persist to localStorage; on native we keep SecureStore.
 */
import { Platform } from "react-native";
import * as ExpoSecureStore from "expo-secure-store";

function webGet(key: string): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage.getItem(key);
}

function webSet(key: string, value: string): void {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error(`[secureStore] localStorage unavailable for ${key}`);
  }
  window.localStorage.setItem(key, value);
}

function webDelete(key: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(key);
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return webGet(key);
    } catch {
      return null;
    }
  }
  return ExpoSecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    webSet(key, value);
    return;
  }
  await ExpoSecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === "web") {
    webDelete(key);
    return;
  }
  await ExpoSecureStore.deleteItemAsync(key);
}

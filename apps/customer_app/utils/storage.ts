/**
 * Cross-platform secure storage.
 * Native: SecureStore; Web: localStorage (no secrets on web).
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    }
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    console.warn(`[Storage] getItem ${key} failed:`, e);
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    console.warn(`[Storage] setItem ${key} failed:`, e);
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    console.warn(`[Storage] removeItem ${key} failed:`, e);
  }
}

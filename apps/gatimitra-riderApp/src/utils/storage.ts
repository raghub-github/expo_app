/**
 * Cross-platform storage utility
 * Uses SecureStore on native, localStorage on web
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      // Use localStorage on web
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    }
    // Use SecureStore on native
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.warn(`Error getting item ${key}:`, error);
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use localStorage on web
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
      return;
    }
    // Use SecureStore on native
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.warn(`Error setting item ${key}:`, error);
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use localStorage on web
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
      return;
    }
    // Use SecureStore on native
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.warn(`Error removing item ${key}:`, error);
  }
}


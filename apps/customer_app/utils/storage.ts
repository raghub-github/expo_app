/**
 * Cross-platform persisted storage.
 *
 * Secrets (auth token, device id) → SecureStore (small values only; Android ~2KB cap).
 * Cart, session JSON, caches → AsyncStorage (no size limit).
 *
 * Legacy SecureStore blobs for large keys are migrated on read and deleted.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { STORAGE_KEYS } from "@/constants";

/** Stable device id key (see utils/deviceId.ts). */
export const DEVICE_ID_STORAGE_KEY = "gm_customer_device_id";

/**
 * Only these keys stay in SecureStore. Everything else uses AsyncStorage so cart /
 * session payloads cannot hit the 2KB Android SecureStore limit (which warns today
 * and throws on newer Expo SDKs).
 */
const SECURE_STORE_KEYS = new Set<string>([
  STORAGE_KEYS.AUTH_TOKEN,
  DEVICE_ID_STORAGE_KEY,
]);

function usesAsyncStorage(key: string): boolean {
  return !SECURE_STORE_KEYS.has(key);
}

async function readLegacySecureValue(key: string): Promise<string | null> {
  if (Platform.OS === "web" || SECURE_STORE_KEYS.has(key)) return null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function deleteLegacySecureValue(key: string): Promise<void> {
  if (Platform.OS === "web" || SECURE_STORE_KEYS.has(key)) return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore — migration cleanup is best-effort
  }
}

async function migrateLegacySecureToAsync(key: string): Promise<string | null> {
  const legacy = await readLegacySecureValue(key);
  if (legacy == null) return null;
  try {
    await AsyncStorage.setItem(key, legacy);
    await deleteLegacySecureValue(key);
  } catch {
    // Still return legacy so hydrate does not lose data mid-migration.
  }
  return legacy;
}

export async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    }
    if (usesAsyncStorage(key)) {
      const raw = await AsyncStorage.getItem(key);
      if (raw != null) return raw;
      return await migrateLegacySecureToAsync(key);
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
    if (usesAsyncStorage(key)) {
      await AsyncStorage.setItem(key, value);
      await deleteLegacySecureValue(key);
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
    if (usesAsyncStorage(key)) {
      await AsyncStorage.removeItem(key);
      await deleteLegacySecureValue(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    console.warn(`[Storage] removeItem ${key} failed:`, e);
  }
}

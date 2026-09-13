/**
 * Cross-platform storage for the Rider app.
 *
 * Secrets (access token, session meta, device id) → SecureStore (with AsyncStorage mirror).
 * Everything else (onboarding drafts, caches) → AsyncStorage — Android SecureStore ~2KB
 * limit silently fails on large blobs and was a session/onboarding persistence risk.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Auth / device keys that must survive kill + restart. */
export const RIDER_SECURE_KEYS = new Set<string>([
  "gm_rider_access_token_v1",
  "gm_rider_session_meta_v1",
  "gm_session_v1", // legacy session blob
  "gm_device_id_v1",
]);

function isSecureKey(key: string): boolean {
  return RIDER_SECURE_KEYS.has(key);
}

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.warn(`[Storage] SecureStore get failed for ${key}:`, error);
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* best-effort */
  }
}

async function asyncGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.warn(`[Storage] AsyncStorage get failed for ${key}:`, error);
    return null;
  }
}

async function asyncSet(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

async function asyncDelete(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* best-effort */
  }
}

export async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    }

    if (isSecureKey(key)) {
      const fromSecure = await secureGet(key);
      if (fromSecure != null) return fromSecure;
      // Mirror / recovery path when SecureStore is empty or temporarily unreadable.
      return await asyncGet(key);
    }

    const fromAsync = await asyncGet(key);
    if (fromAsync != null) return fromAsync;

    // Migrate legacy large blobs that used to live in SecureStore (often failed silently).
    const legacy = await secureGet(key);
    if (legacy == null) return null;
    try {
      await asyncSet(key, legacy);
      await secureDelete(key);
    } catch {
      /* still return legacy so this read is not a hard miss */
    }
    return legacy;
  } catch (error) {
    console.warn(`[Storage] getItem ${key} failed:`, error);
    return null;
  }
}

/**
 * Persist a value. For auth keys, writes SecureStore + AsyncStorage mirror.
 * Throws if the value could not be persisted to at least one durable store
 * (callers that own login/session must not treat a failed write as success).
 */
export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    throw new Error(`[Storage] localStorage unavailable for ${key}`);
  }

  if (isSecureKey(key)) {
    let secureOk = false;
    let asyncOk = false;
    try {
      await secureSet(key, value);
      secureOk = true;
    } catch (error) {
      console.warn(`[Storage] SecureStore set failed for ${key}:`, error);
    }
    try {
      await asyncSet(key, value);
      asyncOk = true;
    } catch (error) {
      console.warn(`[Storage] AsyncStorage mirror set failed for ${key}:`, error);
    }
    if (!secureOk && !asyncOk) {
      throw new Error(`[Storage] Failed to persist secure key ${key}`);
    }
    return;
  }

  await asyncSet(key, value);
  // Drop any legacy SecureStore copy so we don't keep oversized values there.
  await secureDelete(key);
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      return;
    }
    if (isSecureKey(key)) {
      await Promise.all([secureDelete(key), asyncDelete(key)]);
      return;
    }
    await asyncDelete(key);
  } catch (error) {
    console.warn(`[Storage] removeItem ${key} failed:`, error);
  }
}

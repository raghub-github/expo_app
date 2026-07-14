/**
 * Sync-friendly KV for hot caches (menus, offers).
 * Uses react-native-mmkv when the native module is available (dev client / release),
 * otherwise falls back to in-memory + AsyncStorage (Expo Go / web).
 *
 * Note: there is no npm package named `react-native-hermes` — Hermes is the
 * default JS engine in Expo (set via app.json `jsEngine: "hermes"`).
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type KvLike = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

const memory = new Map<string, string>();
let mmkv: KvLike | null = null;
let mmkvTried = false;

function tryInitMmkv(): KvLike | null {
  if (mmkvTried) return mmkv;
  mmkvTried = true;
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require("react-native-mmkv") as {
      createMMKV: (cfg?: { id?: string }) => KvLike;
    };
    mmkv = createMMKV({ id: "gatimitra-customer-fast" });
    return mmkv;
  } catch {
    mmkv = null;
    return null;
  }
}

/** Synchronous read — MMKV or memory (after async hydrate). */
export function fastGetString(key: string): string | null {
  const store = tryInitMmkv();
  if (store) {
    try {
      return store.getString(key) ?? null;
    } catch {
      /* fall through */
    }
  }
  return memory.get(key) ?? null;
}

/** Synchronous write — MMKV + memory; also mirrors to AsyncStorage in background. */
export function fastSetString(key: string, value: string): void {
  memory.set(key, value);
  const store = tryInitMmkv();
  if (store) {
    try {
      store.set(key, value);
    } catch {
      /* ignore */
    }
  }
  void AsyncStorage.setItem(key, value).catch(() => {});
}

export function fastRemove(key: string): void {
  memory.delete(key);
  const store = tryInitMmkv();
  if (store) {
    try {
      store.remove(key);
    } catch {
      /* ignore */
    }
  }
  void AsyncStorage.removeItem(key).catch(() => {});
}

/** One-shot: pull AsyncStorage into memory when MMKV is unavailable. */
export async function hydrateFastKvFromAsyncStorage(keys: string[]): Promise<void> {
  if (tryInitMmkv()) return;
  try {
    const pairs = await AsyncStorage.multiGet(keys);
    for (const [k, v] of pairs) {
      if (k && v != null) memory.set(k, v);
    }
  } catch {
    /* ignore */
  }
}

export function isFastKvNative(): boolean {
  return tryInitMmkv() != null;
}

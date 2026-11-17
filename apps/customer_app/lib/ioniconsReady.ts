/**
 * Shared Ionicons readiness — cold-start Home can paint before RootLayout's
 * useFonts settles, which left pin/wallet/bell/tab icons as empty circles.
 */
import { useEffect, useState } from "react";
import * as Font from "expo-font";
import { Ionicons } from "@expo/vector-icons";

type IonGlobal = {
  __gatimitraIonicons?: {
    ready: boolean;
    promise: Promise<boolean> | null;
    listeners: Set<() => void>;
  };
};

function store() {
  const g = globalThis as IonGlobal;
  if (!g.__gatimitraIonicons) {
    g.__gatimitraIonicons = {
      ready: false,
      promise: null,
      listeners: new Set(),
    };
  }
  return g.__gatimitraIonicons;
}

export function isIoniconsReady(): boolean {
  return store().ready;
}

/** Kick font load ASAP (safe to call many times). */
export function ensureIoniconsLoaded(): Promise<boolean> {
  const s = store();
  if (s.ready) return Promise.resolve(true);
  if (s.promise) return s.promise;
  s.promise = Font.loadAsync({ ...Ionicons.font })
    .then(() => {
      s.ready = true;
      s.listeners.forEach((l) => l());
      return true;
    })
    .catch(() => {
      s.promise = null;
      return false;
    });
  return s.promise;
}

export function useIoniconsReady(): boolean {
  const [ready, setReady] = useState(() => store().ready);

  useEffect(() => {
    if (store().ready) {
      setReady(true);
      return;
    }
    const onReady = () => setReady(true);
    store().listeners.add(onReady);
    void ensureIoniconsLoaded();
    return () => {
      store().listeners.delete(onReady);
    };
  }, []);

  return ready;
}

// Warm during JS bootstrap — don't wait for first skeleton mount.
void ensureIoniconsLoaded();

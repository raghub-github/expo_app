import { AppState, Platform, InteractionManager, type AppStateStatus, type NativeEventSubscription } from "react-native";
import {
  isExpoGoRuntime,
  loadNotificationsModule,
  openNotificationSettings,
  readNotificationPermission,
  requestNotificationPermission,
} from "./permission";
import {
  ensureAndroidChannels,
  getFreshExpoPushToken,
  getFreshNativePushToken,
  setNotificationHandlerDefaults,
} from "./token";
import { registerExpoPushTokenOnBackend, unregisterPushTokenOnBackend } from "./register";
import { markClickedRemote } from "./inbox";
import type {
  PushControllerOptions,
  PushControllerSnapshot,
  PushNotificationOpenPayload,
  UnregisterPushOptions,
} from "./types";

const DEFAULT_SNAPSHOT: PushControllerSnapshot = {
  osStatus: "undetermined",
  canAskAgain: true,
  expoGoUnsupported: false,
  loading: false,
  syncStatus: "idle",
  error: null,
  expoPushToken: null,
  nativePushToken: null,
  nativeTokenType: null,
  lastBackendSyncAt: null,
  lastBackendSyncOk: null,
};

function deviceType(): "ios" | "android" | "web" | "unknown" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "web") return "web";
  return "unknown";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let lastOpenSig = "";
let lastOpenAt = 0;

function emitNotificationOpen(
  options: PushControllerOptions,
  payload: PushNotificationOpenPayload,
): void {
  const sig = `${payload.title ?? ""}|${JSON.stringify(payload.data ?? {})}`;
  const now = Date.now();
  if (sig === lastOpenSig && now - lastOpenAt < 2500) return;
  lastOpenSig = sig;
  lastOpenAt = now;
  const run = () => options.onNotificationOpen?.(payload);
  InteractionManager.runAfterInteractions(() => {
    setTimeout(run, 350);
  });
}

function notificationIdFromData(data: Record<string, unknown>): string | null {
  const raw = data.notification_id ?? data.notificationId;
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

async function reportClickIfPresent(
  apiBaseUrl: string,
  getAuth: PushControllerOptions["getAuth"],
  data: Record<string, unknown>,
): Promise<void> {
  const nid = notificationIdFromData(data);
  if (!nid) return;
  const auth = getAuth();
  if (!auth?.accessToken) return;
  try {
    await markClickedRemote(
      {
        baseUrl: apiBaseUrl,
        getAuthHeader: async () => `Bearer ${auth.accessToken}`,
      },
      nid,
    );
  } catch {
    // Analytics best-effort — never block navigation.
  }
}

function syncKey(parts: {
  expo: string | null;
  native: string | null;
  role: string;
  storeId?: number | null;
  userPrefix: string;
}): string {
  return [
    parts.userPrefix,
    parts.role,
    parts.storeId ?? "",
    parts.expo ?? "",
    parts.native ?? "",
  ].join("|");
}

export type PushPermissionController = {
  getSnapshot: () => PushControllerSnapshot;
  subscribe: (fn: (s: PushControllerSnapshot) => void) => () => void;
  /** Refresh OS permission + optionally sync tokens if granted. */
  refresh: (opts?: { syncIfGranted?: boolean }) => Promise<PushControllerSnapshot>;
  /**
   * Shared Allow behavior:
   * 1) read OS permission
   * 2) request if askable
   * 3) open settings if denied/blocked
   * 4) on grant → channels + dual-token register
   */
  requestOrOpenSettings: () => Promise<{
    granted: boolean;
    openedSettings: boolean;
    snapshot: PushControllerSnapshot;
  }>;
  openSettings: () => Promise<void>;
  /** Force token obtain + backend register when permission already granted. */
  syncTokens: () => Promise<PushControllerSnapshot>;
  /** Start AppState / token-refresh / cold-start listeners. */
  startLifecycle: () => void;
  stopLifecycle: () => void;
  /** Logout: unregister current tokens from backend. */
  unregisterCurrent: (opts?: UnregisterPushOptions) => Promise<void>;
};

export function createPushPermissionController(
  options: PushControllerOptions
): PushPermissionController {
  let snapshot: PushControllerSnapshot = {
    ...DEFAULT_SNAPSHOT,
    expoGoUnsupported: isExpoGoRuntime(),
  };
  const listeners = new Set<(s: PushControllerSnapshot) => void>();
  let lastSyncedKey: string | null = null;
  let syncInFlight: Promise<PushControllerSnapshot> | null = null;
  let appStateSub: NativeEventSubscription | null = null;
  let tokenSub: { remove: () => void } | null = null;
  let responseSub: { remove: () => void } | null = null;
  let receivedSub: { remove: () => void } | null = null;
  let lifecycleStarted = false;
  let drainedColdStart = false;

  const log = (message: string, extra?: Record<string, unknown>) => {
    if (options.log) options.log(message, extra);
    else if (extra) console.log(`[push] ${message}`, extra);
    else console.log(`[push] ${message}`);
  };

  const emit = (patch: Partial<PushControllerSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const fn of listeners) fn(snapshot);
  };

  const refreshPermissionOnly = async (): Promise<PushControllerSnapshot> => {
    emit({ loading: true, error: null });
    const perm = await readNotificationPermission();
    log(`Notification permission: ${perm.osStatus}`, {
      canAskAgain: perm.canAskAgain,
      expoGo: isExpoGoRuntime(),
    });
    emit({
      loading: false,
      osStatus: perm.osStatus,
      canAskAgain: perm.canAskAgain,
      expoGoUnsupported: isExpoGoRuntime(),
    });
    return snapshot;
  };

  const syncTokens = async (): Promise<PushControllerSnapshot> => {
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      const auth = options.getAuth();
      if (!auth?.accessToken) {
        emit({ syncStatus: "idle", error: null });
        return snapshot;
      }
      if (snapshot.osStatus !== "granted") {
        // Use the returned snapshot, not the closure `snapshot`: refreshPermissionOnly
        // reassigns it internally, but TS keeps the `!== "granted"` narrowing above
        // across the await and would flag the re-check as impossible (TS2367).
        const refreshed = await refreshPermissionOnly();
        if (refreshed.osStatus !== "granted") {
          emit({ syncStatus: "idle" });
          return snapshot;
        }
      }

      if (isExpoGoRuntime()) {
        // Expo Go cannot register remote FCM/Expo push tokens — soft-skip, never error.
        if (__DEV__) {
          console.info(
            "[push] Expo Go detected — skipping remote FCM/Expo token registration",
          );
        }
        emit({
          expoGoUnsupported: true,
          syncStatus: "idle",
          error: null,
          lastBackendSyncOk: true,
        });
        return snapshot;
      }

      emit({ syncStatus: "syncing", error: null });

      if (options.androidChannels?.length) {
        await ensureAndroidChannels(options.androidChannels);
      }

      const expoToken = await getFreshExpoPushToken({ requestIfNeeded: false });
      const native = await getFreshNativePushToken();

      if (!expoToken && !native?.token) {
        emit({
          syncStatus: "error",
          error: "expo_token_unavailable",
          expoPushToken: null,
          nativePushToken: null,
          lastBackendSyncOk: false,
        });
        return snapshot;
      }

      emit({
        expoPushToken: expoToken,
        nativePushToken: native?.token ?? null,
        nativeTokenType: native?.type ?? null,
      });

      const userPrefix = auth.accessToken.slice(0, 12);
      const key = syncKey({
        expo: expoToken,
        native: native?.token ?? null,
        role: auth.role,
        storeId: auth.storeId,
        userPrefix,
      });
      if (key === lastSyncedKey && snapshot.lastBackendSyncOk) {
        emit({ syncStatus: "ok" });
        return snapshot;
      }

      let metadata = {};
      try {
        metadata = (await options.collectDeviceMetadata?.()) ?? {};
      } catch {
        // non-fatal
      }

      const attempts = [0, 1500, 5000];
      let lastError: string | undefined;
      let lastStatus = 0;
      for (let i = 0; i < attempts.length; i++) {
        if (attempts[i]) await sleep(attempts[i]);
        const res = await registerExpoPushTokenOnBackend(options.apiBaseUrl, auth.accessToken, {
          expo_push_token: expoToken,
          device_type: deviceType(),
          native_push_token: native?.token ?? null,
          native_token_type: native?.type ?? null,
          store_id: auth.storeId ?? null,
          ...metadata,
        });
          if (res.ok) {
          lastSyncedKey = key;
          if (auth.role === "merchant" && expoToken && options.registerStoreExpoToken) {
            try {
              await options.registerStoreExpoToken({
                storeId: auth.storeId ?? 0,
                expoPushToken: expoToken,
                accessToken: auth.accessToken,
                platform: Platform.OS,
              });
            } catch (e) {
              log("store expo token register failed (non-fatal)", {
                error: (e as Error)?.message,
              });
            }
          }
          emit({
            syncStatus: "ok",
            lastBackendSyncAt: Date.now(),
            lastBackendSyncOk: true,
            error: null,
          });
          log("tokens registered", {
            role: auth.role,
            hasExpo: !!expoToken,
            hasNative: !!native?.token,
            storeId: auth.storeId ?? null,
          });
          return snapshot;
        }
        lastError = res.error;
        lastStatus = res.status;
        if (res.status === 401 || res.status === 403) break;
      }

      emit({
        syncStatus: "error",
        error: lastError ?? `register_failed_${lastStatus}`,
        lastBackendSyncAt: Date.now(),
        lastBackendSyncOk: false,
      });
      return snapshot;
    })().finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  };

  const refresh = async (opts?: { syncIfGranted?: boolean }): Promise<PushControllerSnapshot> => {
    await refreshPermissionOnly();
    if (opts?.syncIfGranted !== false && snapshot.osStatus === "granted") {
      return syncTokens();
    }
    return snapshot;
  };

  const requestOrOpenSettings = async () => {
    emit({ loading: true, error: null });
    await setNotificationHandlerDefaults();

    let perm = await readNotificationPermission();
    emit({
      osStatus: perm.osStatus,
      canAskAgain: perm.canAskAgain,
      loading: false,
    });

    if (perm.osStatus === "granted") {
      await syncTokens();
      return { granted: true, openedSettings: false, snapshot };
    }

    if (perm.canAskAgain && perm.osStatus !== "blocked") {
      perm = await requestNotificationPermission();
      emit({
        osStatus: perm.osStatus,
        canAskAgain: perm.canAskAgain,
      });
      if (perm.osStatus === "granted") {
        await syncTokens();
        return { granted: true, openedSettings: false, snapshot };
      }
    }

    await openNotificationSettings(options.androidPackageName);
    // Every "granted" path above already returned, so perm.osStatus is never
    // "granted" here — the old `=== "granted"` branch was dead (TS2367).
    emit({
      osStatus: perm.canAskAgain ? "denied" : "blocked",
      canAskAgain: perm.canAskAgain,
    });
    return { granted: false, openedSettings: true, snapshot };
  };

  const openSettings = async () => {
    await openNotificationSettings(options.androidPackageName);
  };

  const attachNotificationListeners = async () => {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) return;

    if (!responseSub) {
      responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
        const c = response.notification.request.content;
        const payload: PushNotificationOpenPayload = {
          title: c.title ?? null,
          body: c.body ?? null,
          data: (c.data ?? {}) as Record<string, unknown>,
        };
        void reportClickIfPresent(options.apiBaseUrl, options.getAuth, payload.data);
        emitNotificationOpen(options, payload);
      });
    }

    if (!receivedSub) {
      receivedSub = Notifications.addNotificationReceivedListener((notification) => {
        const c = notification.request.content;
        const payload: PushNotificationOpenPayload = {
          title: c.title ?? null,
          body: c.body ?? null,
          data: (c.data ?? {}) as Record<string, unknown>,
        };
        options.onForeground?.(payload);
      });
    }

    if (!tokenSub && !isExpoGoRuntime()) {
      tokenSub = Notifications.addPushTokenListener(() => {
        lastSyncedKey = null;
        void syncTokens();
      });
    }

    if (!drainedColdStart) {
      drainedColdStart = true;
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last) {
          const c = last.notification.request.content;
          const payload: PushNotificationOpenPayload = {
            title: c.title ?? null,
            body: c.body ?? null,
            data: (c.data ?? {}) as Record<string, unknown>,
          };
          void reportClickIfPresent(options.apiBaseUrl, options.getAuth, payload.data);
          emitNotificationOpen(options, payload);
        }
      } catch {
        // ignore
      }
    }
  };

  const startLifecycle = () => {
    if (lifecycleStarted) return;
    lifecycleStarted = true;
    void setNotificationHandlerDefaults();
    if (options.androidChannels?.length) {
      void ensureAndroidChannels(options.androidChannels);
    }
    void attachNotificationListeners();
    void refresh({ syncIfGranted: true });

    appStateSub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") {
        void refresh({ syncIfGranted: true });
      }
    });
  };

  const stopLifecycle = () => {
    lifecycleStarted = false;
    appStateSub?.remove();
    appStateSub = null;
    tokenSub?.remove();
    tokenSub = null;
    responseSub?.remove();
    responseSub = null;
    receivedSub?.remove();
    receivedSub = null;
  };

  const unregisterCurrent = async (opts?: UnregisterPushOptions) => {
    const auth = options.getAuth();
    const accessToken = opts?.accessToken?.trim() || auth?.accessToken;
    if (!accessToken) return;

    // Prefer in-memory tokens; if logout races before first sync, re-read device tokens.
    let expoToken = snapshot.expoPushToken;
    let nativeToken = snapshot.nativePushToken;
    if (!expoToken && !nativeToken) {
      try {
        expoToken = (await getFreshExpoPushToken({ requestIfNeeded: false })) ?? null;
        const native = await getFreshNativePushToken();
        nativeToken = native?.token ?? null;
      } catch {
        /* full user purge still works with empty body */
      }
    }
    const role = auth?.role ?? opts?.role;

    // Empty tokens → backend purges ALL push rows for this user/role (logout-safe).
    await unregisterPushTokenOnBackend(options.apiBaseUrl, accessToken, {
      expo_push_token: expoToken,
      native_push_token: nativeToken,
    });

    if (role === "merchant" && options.unregisterStoreExpoToken) {
      try {
        if (expoToken) {
          await options.unregisterStoreExpoToken({
            expoPushToken: expoToken,
            accessToken,
          });
        }
      } catch (e) {
        log("store expo token unregister failed (non-fatal)", {
          error: (e as Error)?.message,
        });
      }
    }

    stopLifecycle();
    lastSyncedKey = null;
    emit({
      expoPushToken: null,
      nativePushToken: null,
      nativeTokenType: null,
      syncStatus: "idle",
      lastBackendSyncOk: null,
    });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      fn(snapshot);
      return () => listeners.delete(fn);
    },
    refresh,
    requestOrOpenSettings,
    openSettings,
    syncTokens,
    startLifecycle,
    stopLifecycle,
    unregisterCurrent,
  };
}

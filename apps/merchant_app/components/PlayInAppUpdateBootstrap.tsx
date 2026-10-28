/**
 * Google Play In-App Updates — official Play Core UI only (no custom sheet).
 * Uses flexible update when allowed; falls back to the Play Store listing if
 * the in-app update flow cannot start. Requires a Play-distributed build.
 * Skipped in Expo Go / non-Android.
 */

import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";

const isExpoGo = Constants.appOwnership === "expo";
const PACKAGE_NAME =
  Constants.expoConfig?.android?.package ?? Application.applicationId ?? "com.gatimitra.partner";

export function PlayInAppUpdateBootstrap() {
  if (Platform.OS !== "android" || isExpoGo) return null;
  return <PlayInAppUpdateBootstrapInner />;
}

function resolveAndroidVersionCode(): string {
  const fromNative = Application.nativeBuildVersion;
  if (fromNative && /^\d+$/.test(String(fromNative))) return String(fromNative);
  const fromConfig = Constants.expoConfig?.android?.versionCode;
  if (typeof fromConfig === "number" && Number.isFinite(fromConfig)) return String(fromConfig);
  if (typeof fromConfig === "string" && /^\d+$/.test(fromConfig)) return fromConfig;
  return "0";
}

function compareAndroidVersionCodes(storeVersion: string, curVersion: string): -1 | 0 | 1 {
  const store = Number.parseInt(storeVersion, 10);
  const cur = Number.parseInt(curVersion, 10);
  if (!Number.isFinite(store) || !Number.isFinite(cur)) return 0;
  if (store === cur) return 0;
  return store > cur ? 1 : -1;
}

function openPlayStoreListing() {
  const market = `market://details?id=${PACKAGE_NAME}`;
  const https = `https://play.google.com/store/apps/details?id=${PACKAGE_NAME}`;
  void Linking.openURL(market).catch(() => {
    void Linking.openURL(https);
  });
}

/** Only one update host in the tree (avoids duplicate Play prompts on remount). */
let playUpdateHostToken: symbol | null = null;

function PlayInAppUpdateBootstrapInner() {
  const [isLeader, setIsLeader] = useState(false);
  const dismissedRef = useRef(false);
  const inFlightRef = useRef(false);
  const flowActiveRef = useRef(false);
  const clientRef = useRef<InstanceType<
    typeof import("sp-react-native-in-app-updates").default
  > | null>(null);
  const downloadedStatusRef = useRef(0);
  const canceledStatusRef = useRef(0);
  const failedStatusRef = useRef(0);
  const availableStatusRef = useRef(0);
  const hostTokenRef = useRef(Symbol("play-update-host"));

  useEffect(() => {
    if (playUpdateHostToken) return;
    playUpdateHostToken = hostTokenRef.current;
    setIsLeader(true);
    return () => {
      if (playUpdateHostToken === hostTokenRef.current) playUpdateHostToken = null;
    };
  }, []);

  useEffect(() => {
    if (!isLeader) return;
    let cancelled = false;
    let statusListener: ((event: { status: number }) => void) | null = null;
    let intentListener: ((result: number) => void) | null = null;
    let flexibleKind = 0;
    let immediateKind = 1;

    const startOfficialUpdate = async (
      client: NonNullable<typeof clientRef.current>,
      extras: {
        isFlexibleUpdateAllowed?: boolean;
        isImmediateUpdateAllowed?: boolean;
      } | null
    ) => {
      const flexibleAllowed = extras?.isFlexibleUpdateAllowed !== false;
      const immediateAllowed = extras?.isImmediateUpdateAllowed === true;
      const updateType =
        flexibleAllowed || !immediateAllowed ? flexibleKind : immediateKind;

      if (!flexibleAllowed && !immediateAllowed) {
        openPlayStoreListing();
        return;
      }

      try {
        flowActiveRef.current = true;
        await client.startUpdate({ updateType });
      } catch (err) {
        flowActiveRef.current = false;
        if (__DEV__) console.warn("[PlayInAppUpdate] startUpdate failed, opening store:", err);
        openPlayStoreListing();
      }
    };

    const promptIfNeeded = async () => {
      if (cancelled || dismissedRef.current || !clientRef.current) return;
      if (inFlightRef.current || flowActiveRef.current) return;

      inFlightRef.current = true;
      try {
        const curVersionCode = resolveAndroidVersionCode();
        const result = await clientRef.current.checkNeedsUpdate({
          curVersion: curVersionCode,
          customVersionComparator: compareAndroidVersionCodes,
        });

        const other = result.other && typeof result.other === "object" ? result.other : null;
        const updateAvailability =
          other && "updateAvailability" in other
            ? (other as { updateAvailability?: number }).updateAvailability
            : undefined;

        const playSaysAvailable =
          result.shouldUpdate || updateAvailability === availableStatusRef.current;

        if (!playSaysAvailable) return;

        await startOfficialUpdate(
          clientRef.current,
          other as {
            isFlexibleUpdateAllowed?: boolean;
            isImmediateUpdateAllowed?: boolean;
          } | null
        );
      } catch (err) {
        if (__DEV__) console.warn("[PlayInAppUpdate] check unavailable:", err);
      } finally {
        inFlightRef.current = false;
      }
    };

    const boot = async () => {
      try {
        const mod = await import("sp-react-native-in-app-updates");
        if (cancelled) return;

        const { IAUInstallStatus, IAUAvailabilityStatus, IAUUpdateKind } = mod;
        availableStatusRef.current = IAUAvailabilityStatus.AVAILABLE;
        downloadedStatusRef.current = IAUInstallStatus.DOWNLOADED;
        canceledStatusRef.current = IAUInstallStatus.CANCELED;
        failedStatusRef.current = IAUInstallStatus.FAILED;
        flexibleKind = IAUUpdateKind.FLEXIBLE;
        immediateKind = IAUUpdateKind.IMMEDIATE;

        const client = new mod.default(false);
        clientRef.current = client;

        statusListener = (event) => {
          if (event.status === downloadedStatusRef.current) {
            try {
              client.installUpdate();
            } catch {
              /* Play may already prompt restart */
            }
            flowActiveRef.current = false;
            return;
          }
          if (
            event.status === canceledStatusRef.current ||
            event.status === failedStatusRef.current
          ) {
            flowActiveRef.current = false;
          }
        };
        client.addStatusUpdateListener(statusListener);

        intentListener = (result) => {
          if (result === canceledStatusRef.current) {
            dismissedRef.current = true;
            flowActiveRef.current = false;
            return;
          }
        };
        client.addIntentSelectionListener(intentListener);

        await promptIfNeeded();
      } catch (err) {
        if (__DEV__) console.warn("[PlayInAppUpdate] unavailable:", err);
      }
    };

    void boot();

    const onAppState = (next: AppStateStatus) => {
      if (next !== "active") return;
      void promptIfNeeded().catch(() => undefined);
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelled = true;
      sub.remove();
      const client = clientRef.current;
      if (client && statusListener) {
        try {
          client.removeStatusUpdateListener(statusListener);
        } catch {
          /* torn down */
        }
      }
      if (client && intentListener) {
        try {
          client.removeIntentSelectionListener(intentListener);
        } catch {
          /* torn down */
        }
      }
    };
  }, [isLeader]);

  return null;
}

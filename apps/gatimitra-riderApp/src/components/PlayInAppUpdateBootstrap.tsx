/**
 * Play update check → branded bottom sheet for GatiMitra Rider.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { PlayUpdateAvailableSheet } from "@/src/components/PlayUpdateAvailableSheet";
import { colors } from "@/src/theme";

const isExpoGo = Constants.appOwnership === "expo";
const APP_NAME = Constants.expoConfig?.name ?? "GatiMitra Rider";
const PACKAGE_NAME =
  Constants.expoConfig?.android?.package ??
  Application.applicationId ??
  "com.raghubhunia.gatimitrariderapp";
const APP_ICON = require("../../assets/images/rideraap.png");

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
  void Linking.openURL(market).catch(() => Linking.openURL(https));
}

function PlayInAppUpdateBootstrapInner() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [storeVersionHint, setStoreVersionHint] = useState<string | null>(null);
  const dismissedRef = useRef(false);
  const clientRef = useRef<InstanceType<
    typeof import("sp-react-native-in-app-updates").default
  > | null>(null);
  const flexibleKindRef = useRef(0);
  const downloadedStatusRef = useRef(0);
  const availableStatusRef = useRef(0);

  const startNativeUpdate = useCallback(async () => {
    setSheetVisible(false);
    const client = clientRef.current;
    if (!client) {
      openPlayStoreListing();
      return;
    }
    try {
      await client.startUpdate({ updateType: flexibleKindRef.current });
    } catch {
      openPlayStoreListing();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let statusListener: ((event: { status: number }) => void) | null = null;

    const promptIfNeeded = async () => {
      if (cancelled || dismissedRef.current || !clientRef.current) return;
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
      const storeVersion =
        other && "availableVersionCode" in other
          ? String((other as { availableVersionCode?: string | number }).availableVersionCode ?? "")
          : result.storeVersion
            ? String(result.storeVersion)
            : "";
      const playSaysAvailable =
        result.shouldUpdate || updateAvailability === availableStatusRef.current;
      if (!playSaysAvailable) return;
      if (storeVersion) setStoreVersionHint(`Update available · v${storeVersion}`);
      else {
        const cur =
          Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "";
        setStoreVersionHint(cur ? `Current · v${cur}` : null);
      }
      setSheetVisible(true);
    };

    const boot = async () => {
      try {
        const mod = await import("sp-react-native-in-app-updates");
        if (cancelled) return;
        const { IAUUpdateKind, IAUInstallStatus, IAUAvailabilityStatus } = mod;
        flexibleKindRef.current = IAUUpdateKind.FLEXIBLE;
        availableStatusRef.current = IAUAvailabilityStatus.AVAILABLE;
        downloadedStatusRef.current = IAUInstallStatus.DOWNLOADED;
        const client = new mod.default(false);
        clientRef.current = client;
        statusListener = (event) => {
          if (event.status === downloadedStatusRef.current) {
            try {
              client.installUpdate();
            } catch {
              /* ignore */
            }
          }
        };
        client.addStatusUpdateListener(statusListener);
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
          /* ignore */
        }
      }
    };
  }, []);

  return (
    <PlayUpdateAvailableSheet
      visible={sheetVisible}
      appName={APP_NAME}
      appIcon={APP_ICON}
      versionHint={storeVersionHint}
      primaryColor={colors.primary[500]}
      onDismiss={() => {
        dismissedRef.current = true;
        setSheetVisible(false);
      }}
      onUpdate={() => void startNativeUpdate()}
      onLearnMore={openPlayStoreListing}
    />
  );
}

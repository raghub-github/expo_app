/**
 * Google Play In-App Updates (flexible) — shows the Play Store "Update available"
 * bottom sheet when a newer version is on Play, same flow as Zomato / partner apps.
 *
 * Requires a Play-distributed build (internal / closed / production). Does not run
 * in Expo Go or sideloaded debug APKs.
 */

import { useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";

const isExpoGo = Constants.appOwnership === "expo";

export function PlayInAppUpdateBootstrap() {
  if (Platform.OS !== "android" || isExpoGo) return null;
  return <PlayInAppUpdateBootstrapInner />;
}

function compareAndroidVersionCodes(
  storeVersion: string,
  curVersion: string
): -1 | 0 | 1 {
  const store = Number.parseInt(storeVersion, 10);
  const cur = Number.parseInt(curVersion, 10);
  if (!Number.isFinite(store) || !Number.isFinite(cur)) return 1;
  if (store === cur) return 0;
  return store > cur ? 1 : -1;
}

function PlayInAppUpdateBootstrapInner() {
  const promptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let client: InstanceType<typeof import("sp-react-native-in-app-updates").default> | null =
      null;
    let statusListener: ((event: { status: number }) => void) | null = null;
    let flexibleKind = 0;
    let availableStatus = 0;
    let downloadedStatus = 0;

    const promptIfNeeded = async () => {
      if (cancelled || promptedRef.current || !client) return;

      const curVersionCode = Application.nativeBuildVersion ?? "0";
      const result = await client.checkNeedsUpdate({
        curVersion: curVersionCode,
        customVersionComparator: compareAndroidVersionCodes,
      });

      const updateAvailability =
        result.other && typeof result.other === "object" && "updateAvailability" in result.other
          ? (result.other as { updateAvailability?: number }).updateAvailability
          : undefined;

      const playSaysAvailable =
        result.shouldUpdate || updateAvailability === availableStatus;

      if (!playSaysAvailable) return;

      promptedRef.current = true;
      await client.startUpdate({ updateType: flexibleKind });
    };

    const boot = async () => {
      try {
        const mod = await import("sp-react-native-in-app-updates");
        if (cancelled) return;

        const { IAUUpdateKind, IAUInstallStatus, IAUAvailabilityStatus } = mod;
        flexibleKind = IAUUpdateKind.FLEXIBLE;
        availableStatus = IAUAvailabilityStatus.AVAILABLE;
        downloadedStatus = IAUInstallStatus.DOWNLOADED;

        client = new mod.default(__DEV__);

        statusListener = (event) => {
          if (event.status === downloadedStatus) {
            try {
              client?.installUpdate();
            } catch {
              // Play may already be prompting to restart.
            }
          }
        };
        client.addStatusUpdateListener(statusListener);

        await promptIfNeeded();
      } catch (err) {
        if (__DEV__) {
          console.warn("[PlayInAppUpdate] unavailable:", err);
        }
      }
    };

    void boot();

    const onAppState = (next: AppStateStatus) => {
      if (next !== "active") return;
      void promptIfNeeded().catch(() => {
        // Ignore transient Play Core errors when returning to foreground.
      });
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelled = true;
      sub.remove();
      if (client && statusListener) {
        try {
          client.removeStatusUpdateListener(statusListener);
        } catch {
          // Native module may already be torn down.
        }
      }
    };
  }, []);

  return null;
}

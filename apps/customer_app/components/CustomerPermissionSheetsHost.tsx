/**
 * Post-onboarding permission sheets — one at a time.
 * Priority: SMS (only when READ_SMS is applicable) → Notifications (FCM) → Location.
 *
 * Does not push live GPS as Current Location. Signed-in bootstrap / resume
 * reconcile owns the active pin (saved address vs current).
 */

import { useCallback, useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSegments } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LocationPermissionModal } from "@/components/LocationPermissionModal";
import { SmsPermissionBottomSheet } from "@/components/SmsPermissionBottomSheet";
import { useLocationStore } from "@/store/locationStore";
import { useSmsPermissionStore } from "@/store/smsPermissionStore";
import { useNotificationPushPromptStore } from "@/store/notificationPushPromptStore";
import { useAuthStore } from "@/store/authStore";
import { reconcileActiveLocationFromGps } from "@/lib/reconcileActiveLocationFromGps";
import {
  isActiveLocationReconcileReady,
  runExclusiveActiveLocationReconcile,
} from "@/lib/activeLocationReconcileGate";
import {
  getDeviceLocationReadiness,
  invalidateDeviceLocationReadiness,
} from "@gatimitra/expo-location-kit";
import { runNotificationPushAllow } from "@/lib/notificationPushAllow";
import { isSessionGpsBootstrapActive } from "@/lib/sessionLocationBootstrap";

export function CustomerPermissionSheetsHost() {
  const segments = useSegments() as string[];
  const queryClient = useQueryClient();
  const showLocationModal = useLocationStore((s) => s.showPermissionModal);
  const setShowLocationModal = useLocationStore((s) => s.setShowPermissionModal);
  const promptLocationPermissionIfNeeded = useLocationStore(
    (s) => s.promptLocationPermissionIfNeeded
  );
  const requestPermissionAndFetch = useLocationStore((s) => s.requestPermissionAndFetch);
  const showSmsSheet = useSmsPermissionStore((s) => s.showSheet);
  const allowInFlight = useSmsPermissionStore((s) => s.allowInFlight);
  const blocksLocation = useSmsPermissionStore((s) => s.blocksLocation);
  const handleAllowSmsPermission = useSmsPermissionStore((s) => s.handleAllowSmsPermission);
  const dismissSmsPermissionSheet = useSmsPermissionStore((s) => s.dismissSmsPermissionSheet);
  const promptSmsPermissionIfNeeded = useSmsPermissionStore((s) => s.promptSmsPermissionIfNeeded);
  const recheckAfterAppActive = useSmsPermissionStore((s) => s.recheckAfterAppActive);

  const showNotificationSheet = useNotificationPushPromptStore((s) => s.showSheet);
  const notificationAllowInFlight = useNotificationPushPromptStore((s) => s.allowInFlight);

  const accessToken = useAuthStore((s) => s.session?.accessToken ?? null);
  const isAuth = segments[0] === "(auth)";
  const isOnboarding = segments[0] === "(onboarding)";
  const canShow = Boolean(accessToken) && !isAuth && !isOnboarding;

  const finishActiveLocationBootstrap = useCallback(async () => {
    if (useSmsPermissionStore.getState().blocksLocation) return;
    if (useNotificationPushPromptStore.getState().showSheet) return;
    await runExclusiveActiveLocationReconcile(async () => {
      invalidateDeviceLocationReadiness();
      const readiness = await getDeviceLocationReadiness({ force: true });

      // Restore saved / backend pin BEFORE any sheet decision — HOME in the sheet
      // meant the store was still empty while addresses already existed.
      if (!readiness.isReady && useAuthStore.getState().session) {
        const { applyActiveLocationFromBackend } = await import(
          "@/lib/applyActiveLocationFromBackend"
        );
        await applyActiveLocationFromBackend(queryClient);
      }

      // No forceFromUser — undetermined only; services-off / dismissed stay quiet.
      await promptLocationPermissionIfNeeded({ skipDeviceFetch: true });

      if (!readiness.isReady) {
        return "done";
      }

      // Join the shared progressive session — skip if Stage A early kick / Stage B
      // already owns acquisition (forceDevice restarts feel like a second GPS storm).
      if (
        useLocationStore.getState().locationSource !== "selected" &&
        !isSessionGpsBootstrapActive()
      ) {
        void requestPermissionAndFetch({ forceDevice: true });
      }

      if (useAuthStore.getState().session) {
        const result = await reconcileActiveLocationFromGps(queryClient);
        if (__DEV__) {
          console.log("[active-location] sheets_host_decision", {
            path: "CustomerPermissionSheetsHost",
            addressId: result?.addressId ?? null,
            source: result?.source ?? null,
            reason: result?.reason ?? null,
            distanceM: result?.distanceM ?? null,
            retentionRadiusM: result?.retentionRadiusM ?? null,
          });
        }
      } else if (!isSessionGpsBootstrapActive()) {
        await requestPermissionAndFetch({ forceDevice: true });
      }
      return "done";
    });
  }, [promptLocationPermissionIfNeeded, requestPermissionAndFetch, queryClient]);

  useEffect(() => {
    if (!canShow) return;
    void (async () => {
      await promptSmsPermissionIfNeeded();
      if (!useSmsPermissionStore.getState().blocksLocation) {
        await finishActiveLocationBootstrap();
      }
    })();
  }, [canShow, promptSmsPermissionIfNeeded, finishActiveLocationBootstrap]);

  useEffect(() => {
    if (!canShow) return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next !== "active") return;
      void (async () => {
        await new Promise((r) => setTimeout(r, 150));
        if (useSmsPermissionStore.getState().allowInFlight) return;
        if (useNotificationPushPromptStore.getState().allowInFlight) return;
        // Fresh OS revalidation after Settings / dialog — never use stale cache.
        await recheckAfterAppActive();
        if (useSmsPermissionStore.getState().blocksLocation) return;
        invalidateDeviceLocationReadiness();
        const readiness = await getDeviceLocationReadiness({ force: true });
        const loc = useLocationStore.getState();
        // Resume GPS is owned by LocationPermissionResumeCheck — sheets only open UI.
        if (!isActiveLocationReconcileReady()) {
          await finishActiveLocationBootstrap();
        } else if (
          readiness.isReady &&
          loc.locationSource !== "selected" &&
          useAuthStore.getState().session
        ) {
          void reconcileActiveLocationFromGps(queryClient);
        }
      })();
    });
    return () => sub.remove();
  }, [canShow, recheckAfterAppActive, finishActiveLocationBootstrap, queryClient]);

  useEffect(() => {
    if (!canShow || blocksLocation || allowInFlight) return;
    if (showNotificationSheet || notificationAllowInFlight) return;
    void finishActiveLocationBootstrap();
  }, [
    canShow,
    blocksLocation,
    allowInFlight,
    showNotificationSheet,
    notificationAllowInFlight,
    finishActiveLocationBootstrap,
  ]);

  const onAllowSms = useCallback(async () => {
    await handleAllowSmsPermission();
  }, [handleAllowSmsPermission]);

  // System POST_NOTIFICATIONS dialog — no custom explanation sheet.
  useEffect(() => {
    if (!canShow || !showNotificationSheet || notificationAllowInFlight) return;
    if (showSmsSheet || allowInFlight) return;
    void runNotificationPushAllow().finally(() => {
      void finishActiveLocationBootstrap();
    });
  }, [
    canShow,
    showNotificationSheet,
    notificationAllowInFlight,
    showSmsSheet,
    allowInFlight,
    finishActiveLocationBootstrap,
  ]);

  const smsVisible = canShow && showSmsSheet && !allowInFlight;
  const notificationVisible =
    canShow && showNotificationSheet && !smsVisible && !allowInFlight;
  const locationVisible =
    canShow &&
    showLocationModal &&
    !blocksLocation &&
    !allowInFlight &&
    !smsVisible &&
    !notificationVisible;

  return (
    <>
      {smsVisible ? (
        <SmsPermissionBottomSheet
          visible
          loading={false}
          onAllow={onAllowSms}
          onSkip={dismissSmsPermissionSheet}
        />
      ) : null}
      <LocationPermissionModal
        visible={locationVisible}
        onDismiss={() => setShowLocationModal(false)}
      />
    </>
  );
}

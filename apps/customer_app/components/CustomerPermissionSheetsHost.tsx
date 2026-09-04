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
import { PermissionPromptBottomSheet } from "@/components/permissions/PermissionPromptBottomSheet";
import { useLocationStore } from "@/store/locationStore";
import { useSmsPermissionStore } from "@/store/smsPermissionStore";
import { useNotificationPushPromptStore } from "@/store/notificationPushPromptStore";
import { useAuthStore } from "@/store/authStore";
import { reconcileActiveLocationFromGps } from "@/lib/reconcileActiveLocationFromGps";
import {
  isActiveLocationReconcileReady,
  runExclusiveActiveLocationReconcile,
} from "@/lib/activeLocationReconcileGate";
import { getDeviceLocationReadiness } from "@gatimitra/expo-location-kit";
import { runNotificationPushAllow } from "@/lib/notificationPushAllow";

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
  const handleSkipNotification = useNotificationPushPromptStore((s) => s.handleSkip);

  const accessToken = useAuthStore((s) => s.session?.accessToken ?? null);
  const isAuth = segments[0] === "(auth)";
  const isOnboarding = segments[0] === "(onboarding)";
  const canShow = Boolean(accessToken) && !isAuth && !isOnboarding;

  const finishActiveLocationBootstrap = useCallback(async () => {
    if (useSmsPermissionStore.getState().blocksLocation) return;
    if (useNotificationPushPromptStore.getState().showSheet) return;
    await runExclusiveActiveLocationReconcile(async () => {
      await promptLocationPermissionIfNeeded({ force: true, skipDeviceFetch: true });
      const readiness = await getDeviceLocationReadiness();
      if (!readiness.isReady) {
        if (useAuthStore.getState().session) {
          const { applyActiveLocationFromBackend } = await import(
            "@/lib/applyActiveLocationFromBackend"
          );
          await applyActiveLocationFromBackend(queryClient);
        }
        return "done";
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
      } else {
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
        await new Promise((r) => setTimeout(r, 800));
        if (useSmsPermissionStore.getState().allowInFlight) return;
        if (useNotificationPushPromptStore.getState().allowInFlight) return;
        // Fresh OS revalidation after Settings / dialog — never use stale cache.
        await recheckAfterAppActive();
        if (!useSmsPermissionStore.getState().blocksLocation) {
          if (isActiveLocationReconcileReady()) return;
          await finishActiveLocationBootstrap();
        }
      })();
    });
    return () => sub.remove();
  }, [canShow, recheckAfterAppActive, finishActiveLocationBootstrap]);

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

  const onAllowNotifications = useCallback(async () => {
    await runNotificationPushAllow();
  }, []);

  const onSkipNotifications = useCallback(() => {
    void handleSkipNotification().then(() => {
      void finishActiveLocationBootstrap();
    });
  }, [handleSkipNotification, finishActiveLocationBootstrap]);

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
      <PermissionPromptBottomSheet
        visible={notificationVisible}
        icon="notifications-outline"
        title="Turn on notifications"
        message="Get order updates, delivery alerts, and important offers as system notifications — even when the app is closed."
        note="You can change this anytime in your phone Settings. Skipping won't limit browsing or ordering."
        noteTitle="Why we ask"
        allowLabel="Allow notifications"
        skipLabel="Skip for now"
        loading={notificationAllowInFlight}
        onAllow={() => void onAllowNotifications()}
        onSkip={onSkipNotifications}
      />
      <LocationPermissionModal
        visible={locationVisible}
        onDismiss={() => setShowLocationModal(false)}
      />
    </>
  );
}

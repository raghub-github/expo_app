/**
 * Post-onboarding permission sheets — one at a time.
 * Priority: SMS (only when READ_SMS is applicable) → Location.
 */

import { useCallback, useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSegments } from "expo-router";
import { LocationPermissionModal } from "@/components/LocationPermissionModal";
import { SmsPermissionBottomSheet } from "@/components/SmsPermissionBottomSheet";
import { useLocationStore } from "@/store/locationStore";
import { useSmsPermissionStore } from "@/store/smsPermissionStore";

export function CustomerPermissionSheetsHost() {
  const segments = useSegments() as string[];
  const showLocationModal = useLocationStore((s) => s.showPermissionModal);
  const setShowLocationModal = useLocationStore((s) => s.setShowPermissionModal);
  const promptLocationPermissionIfNeeded = useLocationStore(
    (s) => s.promptLocationPermissionIfNeeded
  );
  const showSmsSheet = useSmsPermissionStore((s) => s.showSheet);
  const allowInFlight = useSmsPermissionStore((s) => s.allowInFlight);
  const blocksLocation = useSmsPermissionStore((s) => s.blocksLocation);
  const handleAllowSmsPermission = useSmsPermissionStore((s) => s.handleAllowSmsPermission);
  const dismissSmsPermissionSheet = useSmsPermissionStore((s) => s.dismissSmsPermissionSheet);
  const promptSmsPermissionIfNeeded = useSmsPermissionStore((s) => s.promptSmsPermissionIfNeeded);
  const recheckAfterAppActive = useSmsPermissionStore((s) => s.recheckAfterAppActive);

  const isAuth = segments[0] === "(auth)";
  const isOnboarding = segments[0] === "(onboarding)";
  const canShow = !isAuth && !isOnboarding;

  useEffect(() => {
    if (!canShow) return;
    void (async () => {
      await promptSmsPermissionIfNeeded();
      if (!useSmsPermissionStore.getState().blocksLocation) {
        await promptLocationPermissionIfNeeded({ force: true });
      }
    })();
  }, [canShow, promptSmsPermissionIfNeeded, promptLocationPermissionIfNeeded]);

  useEffect(() => {
    if (!canShow) return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next !== "active") return;
      void (async () => {
        await new Promise((r) => setTimeout(r, 800));
        if (useSmsPermissionStore.getState().allowInFlight) return;
        // Fresh OS revalidation after Settings / dialog — never use stale cache.
        await recheckAfterAppActive();
        if (!useSmsPermissionStore.getState().blocksLocation) {
          await promptLocationPermissionIfNeeded();
        }
      })();
    });
    return () => sub.remove();
  }, [canShow, recheckAfterAppActive, promptLocationPermissionIfNeeded]);

  useEffect(() => {
    if (!canShow || blocksLocation || allowInFlight) return;
    void promptLocationPermissionIfNeeded({ force: true });
  }, [canShow, blocksLocation, allowInFlight, promptLocationPermissionIfNeeded]);

  const onAllowSms = useCallback(async () => {
    await handleAllowSmsPermission();
  }, [handleAllowSmsPermission]);

  const smsVisible = canShow && showSmsSheet && !allowInFlight;
  const locationVisible =
    canShow && showLocationModal && !blocksLocation && !allowInFlight && !smsVisible;

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
